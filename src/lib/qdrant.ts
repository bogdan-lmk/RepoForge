import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { generateEmbedding } from "@/lib/openai";
import type { RepoDoc, ParsedQuery } from "@/core/types";
import { db, repos as reposTable } from "@/db";
import { v5 as uuidv5 } from "uuid";

const COLLECTION = "repos";
const DENSE_VECTOR = "dense";
const SPARSE_VECTOR = "bm25";
const SPARSE_MODEL = "qdrant/bm25";
const OPENAI_DENSE_VECTOR_SIZE = 1536;

const client = new QdrantClient({
  url: env.QDRANT_URL,
  apiKey: env.QDRANT_API_KEY,
});

// ── Collection bootstrap ──────────────────────────────────────────────────────

let collectionReady = false;
let collectionBootstrap: Promise<void> | null = null;

export function _resetCollectionReady() {
  collectionReady = false;
  collectionBootstrap = null;
}

type DenseVectorValue = number[] | { text: string; model: string };

async function ensureCollection() {
  if (collectionReady) return;
  if (!collectionBootstrap) {
    collectionBootstrap = bootstrapCollection().finally(() => {
      collectionBootstrap = null;
    });
  }
  await collectionBootstrap;
}

async function bootstrapCollection() {
  const { collections } = await client.getCollections();
  const existing = collections.find((c) => c.name === COLLECTION);

  if (!existing) {
    await createHybridCollection();
    logger.info("Created Qdrant collection with dense + BM25 sparse vectors");
  } else {
    const info = await client.getCollection(COLLECTION);
    if (!isHybridCompatible(info)) {
      logger.warn(
        { config: info.config?.params ?? null },
        "Detected legacy Qdrant collection config; rebuilding hybrid index from PostgreSQL",
      );
      await rebuildCollectionFromDatabase();
    }
  }

  await ensurePayloadIndexes();

  collectionReady = true;
}

// ── Indexing ──────────────────────────────────────────────────────────────────

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
  await upsertPoints(repos);
}

async function upsertPoints(repos: RepoDoc[]): Promise<void> {
  const points = [];
  for (const repo of repos) {
    const text = buildEmbedText(repo);
    try {
      const denseVector = await buildDenseVectorValue(text);
      points.push({
        id: hashSlug(repo.slug),
        vector: {
          [DENSE_VECTOR]: denseVector,
          [SPARSE_VECTOR]: {
            text,
            model: SPARSE_MODEL,
          } as unknown as number[],
        },
        payload: {
          slug: repo.slug,
          name: repo.name,
          description: repo.description,
          capabilities: repo.capabilities,
          primitives: repo.primitives,
          stars: repo.stars,
          language: repo.language,
          topics: repo.topics,
        },
      });
    } catch (e) {
      logger.warn({ err: e, slug: repo.slug }, "Embedding failed");
    }
  }

  if (points.length) {
    await client.upsert(COLLECTION, { points });
    logger.info({ count: points.length }, "Upserted vectors (dense + BM25)");
  }
}

// ── Hybrid Search: Dense + BM25 with RRF Fusion ──────────────────────────────

export async function searchVectors(
  query: string,
  parsed: ParsedQuery,
  limit = 12,
  modeOverride?: "hybrid" | "dense-only",
): Promise<RepoDoc[]> {
  await ensureCollection();
  const denseVector = await buildDenseVectorValue(query);

  const effectiveMode = modeOverride ?? env.VECTOR_MODE;
  if (effectiveMode === "dense-only") {
    return fallbackDenseSearch(denseVector, parsed, limit);
  }

  try {
    const results = await client.query(COLLECTION, {
      prefetch: [
        {
          query: {
            text: query,
            model: SPARSE_MODEL,
          } as unknown as number[],
          using: SPARSE_VECTOR,
          limit: 20,
        },
        {
          query: denseVector,
          using: DENSE_VECTOR,
          limit: 20,
        },
      ],
      query: {
        rrf: {
          weights: [1.0, 3.0],
        },
      },
      limit,
      with_payload: true,
    });

    return (results.points ?? []).map((r) => ({
      slug: (r.payload?.slug as string) ?? "",
      name: (r.payload?.name as string) ?? "",
      url: `https://github.com/${r.payload?.slug ?? ""}`,
      description: (r.payload?.description as string) ?? "",
      readme: "",
      language: (r.payload?.language as string) ?? null,
      topics: (r.payload?.topics as string[]) ?? [],
      stars: (r.payload?.stars as number) ?? 0,
      capabilities: (r.payload?.capabilities as string[]) ?? [],
      primitives: (r.payload?.primitives as string[]) ?? [],
      score: r.score ?? 0,
      source: "vector",
    }));
  } catch (e) {
    logger.warn({ err: e }, "Hybrid query failed, falling back to dense-only search");
    return fallbackDenseSearch(denseVector, parsed, limit);
  }
}

async function fallbackDenseSearch(
  denseVector: DenseVectorValue,
  parsed: ParsedQuery,
  limit: number,
): Promise<RepoDoc[]> {
  const anchorFilter =
    parsed.anchorTerms.length > 0
      ? {
          should: parsed.anchorTerms.flatMap((term) => [
            { key: "slug", match: { value: term.toLowerCase() } },
            { key: "topics", match: { value: term.toLowerCase() } },
          ]),
        }
      : undefined;

  const results = await client.query(COLLECTION, {
    query: denseVector,
    using: DENSE_VECTOR,
    limit,
    with_payload: true,
    ...(anchorFilter ? { filter: anchorFilter } : {}),
  });

  return (results.points ?? []).map((r) => ({
    slug: (r.payload?.slug as string) ?? "",
    name: (r.payload?.name as string) ?? "",
    url: `https://github.com/${r.payload?.slug ?? ""}`,
    description: (r.payload?.description as string) ?? "",
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

export async function reindexAll(repos: RepoDoc[]): Promise<void> {
  logger.info({ count: repos.length }, "Starting full Qdrant re-index (dense + BM25)");

  try {
    await client.deleteCollection(COLLECTION);
    collectionReady = false;
    logger.info("Deleted existing Qdrant collection for re-index");
  } catch (e) {
    logger.warn({ err: e }, "Could not delete collection (may not exist)");
    collectionReady = false;
  }

  await ensureCollection();

  const BATCH = 50;
  for (let i = 0; i < repos.length; i += BATCH) {
    const batch = repos.slice(i, i + BATCH);
    await upsertPoints(batch);
    logger.info({ progress: `${i + batch.length}/${repos.length}` }, "Re-index progress");
  }

  logger.info("Qdrant re-index complete (dense + BM25 sparse)");
}

// ── Utils ─────────────────────────────────────────────────────────────────────

const UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function hashSlug(slug: string): string {
  return uuidv5(slug, UUID_NAMESPACE);
}

async function createHybridCollection() {
  await client.createCollection(COLLECTION, {
    vectors: {
      [DENSE_VECTOR]: {
        size: getConfiguredDenseVectorSize(),
        distance: "Cosine",
      },
    },
    sparse_vectors: {
      [SPARSE_VECTOR]: {
        modifier: "idf",
      },
    },
  });
}

async function ensurePayloadIndexes() {
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

function isHybridCompatible(info: {
  config?: {
    params?: {
      vectors?: unknown;
      sparse_vectors?: Record<string, unknown> | null;
    };
  };
}) {
  const params = info.config?.params;
  return hasNamedDenseVector(params?.vectors) &&
    hasMatchingDenseVectorSize(params?.vectors) &&
    hasBm25SparseVector(params?.sparse_vectors);
}

function hasNamedDenseVector(vectors: unknown) {
  return typeof vectors === "object" &&
    vectors !== null &&
    !("size" in (vectors as Record<string, unknown>)) &&
    DENSE_VECTOR in (vectors as Record<string, unknown>);
}

function hasBm25SparseVector(sparseVectors: Record<string, unknown> | null | undefined) {
  return typeof sparseVectors === "object" &&
    sparseVectors !== null &&
    SPARSE_VECTOR in sparseVectors;
}

function hasMatchingDenseVectorSize(vectors: unknown) {
  if (typeof vectors !== "object" || vectors === null || !hasNamedDenseVector(vectors)) {
    return false;
  }

  const config = (vectors as Record<string, { size?: unknown }>)[DENSE_VECTOR];
  return config?.size === getConfiguredDenseVectorSize();
}

async function rebuildCollectionFromDatabase() {
  const rows = await db.select().from(reposTable);
  const repoDocs = rows.map(toIndexedRepoDoc);

  try {
    await client.deleteCollection(COLLECTION);
    logger.info({ count: repoDocs.length }, "Deleted legacy Qdrant collection before rebuild");
  } catch (error) {
    logger.warn({ err: error }, "Could not delete legacy Qdrant collection before rebuild");
  }

  await createHybridCollection();
  await ensurePayloadIndexes();

  const batchSize = 50;
  for (let index = 0; index < repoDocs.length; index += batchSize) {
    await upsertPoints(repoDocs.slice(index, index + batchSize));
  }

  logger.info({ count: repoDocs.length }, "Rebuilt Qdrant collection into hybrid config");
}

function toIndexedRepoDoc(row: typeof reposTable.$inferSelect): RepoDoc {
  return {
    slug: row.slug,
    name: row.name,
    url: row.url,
    description: row.description ?? "",
    readme: row.readme ?? "",
    language: row.language ?? null,
    topics: row.topics ?? [],
    stars: row.stars ?? 0,
    capabilities: row.capabilities ?? [],
    primitives: row.primitives ?? [],
  };
}

function getDenseProvider() {
  return env.QDRANT_DENSE_PROVIDER;
}

function getConfiguredDenseVectorSize() {
  return getDenseProvider() === "qdrant"
    ? env.QDRANT_DENSE_VECTOR_SIZE
    : OPENAI_DENSE_VECTOR_SIZE;
}

async function buildDenseVectorValue(text: string): Promise<DenseVectorValue> {
  if (getDenseProvider() === "qdrant") {
    return {
      text,
      model: env.QDRANT_DENSE_MODEL,
    };
  }

  return generateEmbedding(text);
}
