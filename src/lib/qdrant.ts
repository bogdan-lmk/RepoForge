import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { generateEmbedding } from "@/lib/openai";
import type { RepoDoc } from "@/core/types";
import { createHash } from "crypto";

const COLLECTION = "repos";
const client = new QdrantClient({ url: env.QDRANT_URL });

async function ensureCollection() {
  const collections = await client.getCollections();
  if (!collections.collections.some((c) => c.name === COLLECTION)) {
    await client.createCollection(COLLECTION, {
      vectors: { size: 1536, distance: "Cosine" },
    });
    logger.info("Created Qdrant collection: %s", COLLECTION);
  }
}

export async function upsertVectors(repos: RepoDoc[]): Promise<void> {
  if (!repos.length) return;
  await ensureCollection();

  const points = [];
  for (const repo of repos) {
    const text = `${repo.slug} ${repo.description} ${(repo.capabilities ?? []).join(" ")}`;
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

export async function searchVectors(
  query: string,
  limit = 12,
): Promise<RepoDoc[]> {
  await ensureCollection();
  const vector = await generateEmbedding(query);

  const results = await client.search(COLLECTION, {
    vector,
    limit,
    with_payload: true,
  });

  return results.map((r) => ({
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

function hashSlug(slug: string): string {
  return createHash("sha256").update(slug).digest("hex").slice(0, 16);
}
