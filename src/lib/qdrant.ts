import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { generateEmbedding } from "@/lib/openai";
import type { RepoDoc, ParsedQuery } from "@/core/types";
import { createHash } from "crypto";
import { v5 as uuidv5 } from "uuid";

const COLLECTION = "repos";
const client = new QdrantClient({
  url: env.QDRANT_URL,
  apiKey: env.QDRANT_API_KEY,
});

// ── Collection bootstrap ──────────────────────────────────────────────────────

async function ensureCollection() {
  const { collections } = await client.getCollections();
  const exists = collections.some((c) => c.name === COLLECTION);

  if (!exists) {
    await client.createCollection(COLLECTION, {
      vectors: { size: 1536, distance: "Cosine" },
    });
    logger.info("Created Qdrant collection: %s", COLLECTION);
  }

  // 3a: Payload indexes — required for keyword filtering.
  // createFieldIndex is idempotent: safe to call on every startup.
  await Promise.allSettled([
    client.createPayloadIndex(COLLECTION, {
      field_name: "slug",
      field_schema: "keyword",
      wait: false,
    }),
    client.createPayloadIndex(COLLECTION, {
      field_name: "topics",
      field_schema: "keyword",
      wait: false,
    }),
    client.createPayloadIndex(COLLECTION, {
      field_name: "language",
      field_schema: "keyword",
      wait: false,
    }),
  ]);
}

// ── Indexing ──────────────────────────────────────────────────────────────────

/**
 * Build the text that gets embedded for a repo.
 * Order matters for embeddings — most important signals first.
 *
 * Includes:
 *   - slug + name           → exact identity
 *   - topics                → categorical labels (e.g. "cli", "authentication")
 *   - capabilities          → AI-extracted abilities (e.g. "copy-trade a trader")
 *   - description           → one-line summary
 *   - readme[:1500 chars]   → ~350-500 tokens, covers feature overview
 *
 * We cap at 1500 chars for readme to stay well within text-embedding-3-small's
 * 8191 token limit (total input rarely exceeds 1000 tokens with this budget).
 */
export function buildEmbedText(repo: RepoDoc): string {
  const parts = [
    repo.slug,
    repo.name,
    (repo.topics ?? []).join(" "),
    (repo.capabilities ?? []).join(" "),
    repo.description ?? "",
    (repo.readme ?? "").slice(0, 1500),
  ];
  return parts.filter(Boolean).join(" ").trim();
}

export async function upsertVectors(repos: RepoDoc[]): Promise<void> {
  if (!repos.length) return;
  await ensureCollection();

  const points = [];
  for (const repo of repos) {
    const text = buildEmbedText(repo);
    try {
      const vector = await generateEmbedding(text);
      points.push({
        id: hashSlug(repo.slug),
        vector,
        payload: {
          slug: repo.slug,
          name: repo.name,
          description: repo.description,
          capabilities: repo.capabilities,
          primitives: repo.primitives,
          stars: repo.stars,
          language: repo.language,
          topics: repo.topics,
          // README not stored in payload — too large, fetched from PG when needed
        },
      });
    } catch (e) {
      logger.warn({ err: e, slug: repo.slug }, "Embedding failed");
    }
  }

  if (points.length) {
    await client.upsert(COLLECTION, { points });
    logger.info({ count: points.length }, "Upserted vectors");
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Vector search with optional keyword boosting via Qdrant `should` filter.
 *
 * 3b: If parsed query has anchor terms (brand/product names like "claude", "supabase"),
 * we add a `should` filter on slug + topics. Qdrant's `should` is a soft constraint —
 * documents that match score higher, but non-matching documents still appear.
 * This gives us "keyword-boosted vector search" without hard filtering.
 *
 * Note: Qdrant keyword index requires exact token match, so "claude" won't match
 * "claude-ai-helper" via slug keyword index — but topics like "claude" will match.
 * The vector itself handles partial/fuzzy matching for slug substring cases.
 */
export async function searchVectors(
  query: string,
  parsed: ParsedQuery,
  limit = 12,
): Promise<RepoDoc[]> {
  await ensureCollection();
  const vector = await generateEmbedding(query);

  // Build `should` filter from anchor terms — soft boost, not hard filter
  const anchorFilter =
    parsed.anchorTerms.length > 0
      ? {
          should: parsed.anchorTerms.flatMap((term) => [
            { key: "slug", match: { value: term.toLowerCase() } },
            { key: "topics", match: { value: term.toLowerCase() } },
          ]),
        }
      : undefined;

  const results = await client.search(COLLECTION, {
    vector,
    limit,
    with_payload: true,
    ...(anchorFilter ? { filter: anchorFilter } : {}),
  });

  return results.map((r) => ({
    slug: (r.payload?.slug as string) ?? "",
    name: (r.payload?.name as string) ?? "",
    url: `https://github.com/${r.payload?.slug ?? ""}`,
    description: (r.payload?.description as string) ?? "",
    // README is NOT stored in Qdrant payload (too large).
    // mergeRepos will pick up readme from the FTS/GitHub result for the same slug.
    readme: "",
    language: (r.payload?.language as string) ?? null,
    topics: (r.payload?.topics as string[]) ?? [],
    stars: (r.payload?.stars as number) ?? 0,
    capabilities: (r.payload?.capabilities as string[]) ?? [],
    primitives: (r.payload?.primitives as string[]) ?? [],
    score: r.score,
    source: "vector",
  }));
}

// ── Re-index ──────────────────────────────────────────────────────────────────

/**
 * Re-index all repos in a Qdrant collection from scratch.
 * Call this after changing buildEmbedText (e.g. adding README to embedding).
 *
 * Strategy: delete collection and re-create, then batch-upsert all provided repos.
 * Caller is responsible for fetching repos from PostgreSQL.
 */
export async function reindexAll(repos: RepoDoc[]): Promise<void> {
  logger.info({ count: repos.length }, "Starting full Qdrant re-index");

  // Drop and recreate to ensure clean slate (no stale vectors with old embedding scheme)
  try {
    await client.deleteCollection(COLLECTION);
    logger.info("Deleted existing Qdrant collection for re-index");
  } catch (e) {
    logger.warn({ err: e }, "Could not delete collection (may not exist)");
  }

  await ensureCollection();

  // Batch in groups of 50 to avoid embedding API timeouts
  const BATCH = 50;
  for (let i = 0; i < repos.length; i += BATCH) {
    const batch = repos.slice(i, i + BATCH);
    await upsertVectors(batch);
    logger.info({ progress: `${i + batch.length}/${repos.length}` }, "Re-index progress");
  }

  logger.info("Qdrant re-index complete");
}

// ── Utils ─────────────────────────────────────────────────────────────────────

const UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function hashSlug(slug: string): string {
  return uuidv5(slug, UUID_NAMESPACE);
}
