import { db, repos, scanLog, repoStarSnapshots } from "@/db";
import { fetchTrending } from "@/lib/ossinsight";
import { fetchRepoDetails } from "@/lib/github";
import { extractCapabilities } from "@/lib/openai";
import { upsertVectors } from "@/lib/qdrant";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";

export async function ingestTrending(): Promise<{
  found: number;
  enriched: number;
}> {
  const logId = await logStart("ossinsight_trending");

  try {
    const trending = await fetchTrending(25);
    logger.info({ count: trending.length }, "Trending repos fetched");

    let enriched = 0;
    for (const t of trending) {
      try {
        const doc = await fetchRepoDetails(t.slug);
        if (!doc) continue;

        const caps = await extractCapabilities(doc);
        doc.capabilities = caps.capabilities;
        doc.primitives = caps.primitives;

        await db
          .insert(repos)
          .values({
            slug: doc.slug,
            name: doc.name,
            url: doc.url,
            description: doc.description,
            readme: doc.readme,
            language: doc.language,
            topics: doc.topics,
            stars: doc.stars,
            capabilities: doc.capabilities,
            primitives: doc.primitives,
            trendScore: String(t.trendScore ?? 0),
          })
          .onConflictDoUpdate({
            target: repos.slug,
            set: {
              stars: doc.stars ?? undefined,
              description: doc.description ?? undefined,
              readme: doc.readme || undefined,
              language: doc.language ?? undefined,
              topics: doc.topics?.length ? doc.topics : undefined,
              capabilities: doc.capabilities?.length ? doc.capabilities : undefined,
              primitives: doc.primitives?.length ? doc.primitives : undefined,
              trendScore: String(t.trendScore ?? 0),
              updatedAt: new Date(),
            },
          });

        try {
          const [existing] = await db
            .select({ id: repos.id })
            .from(repos)
            .where(eq(repos.slug, doc.slug))
            .limit(1);
          if (existing) {
            await db.insert(repoStarSnapshots).values({
              repoId: existing.id,
              stars: doc.stars ?? 0,
            });
          }
        } catch (snapErr) {
          logger.warn({ err: snapErr, slug: doc.slug }, "Star snapshot insert failed");
        }

        try {
          await upsertVectors([doc]);
        } catch {
          logger.warn({ slug: doc.slug }, "Vector upsert failed");
        }

        enriched++;
        logger.info({ slug: doc.slug, caps: caps.capabilities.length }, "Repo ingested");
      } catch (e) {
        logger.warn({ err: e, slug: t.slug }, "Failed to ingest trending repo");
      }
    }

    await logComplete(logId, trending.length, enriched);
    return { found: trending.length, enriched };
  } catch (e) {
    await logError(logId, String(e));
    throw e;
  }
}

async function logStart(source: string): Promise<number> {
  const [row] = await db
    .insert(scanLog)
    .values({ source, status: "running" })
    .returning({ id: scanLog.id });
  return row.id;
}

async function logComplete(id: number, found: number, enriched: number) {
  await db
    .update(scanLog)
    .set({ reposFound: found, reposEnriched: enriched, status: "completed", completedAt: new Date() })
    .where(eq(scanLog.id, id));
}

async function logError(id: number, error: string) {
  await db
    .update(scanLog)
    .set({ status: "failed", error, completedAt: new Date() })
    .where(eq(scanLog.id, id));
}
