import { NextRequest } from "next/server";
import { db, repos } from "@/db";
import { searchMulti, fetchReadme } from "@/lib/github";
import { extractCapabilities } from "@/lib/openai";
import { upsertVectors } from "@/lib/qdrant";
import { logger } from "@/lib/logger";
import { or, sql, desc } from "drizzle-orm";
import { apiResponse, apiError } from "@/core/api-helpers";
import { mapRepoToApi } from "@/core/mappers";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 20), 50);

  if (!q) {
    try {
      const rows = await db
        .select()
        .from(repos)
        .orderBy(desc(repos.stars))
        .limit(limit);

      return apiResponse(rows.map(mapRepoToApi));
    } catch (e) {
      logger.error({ err: e }, "GET /api/repos/search (no query) failed");
      return apiError("Failed to fetch repos", 500);
    }
  }

  try {
    const terms = q.split(/\s+/).filter((t) => t.length > 1);
    const conditions = terms.map((t) =>
      or(
        sql`${repos.slug} ILIKE ${`%${t}%`}`,
        sql`${repos.description} ILIKE ${`%${t}%`}`,
      ),
    );

    const localRows = conditions.length
      ? await db
          .select()
          .from(repos)
          .where(or(...conditions))
          .limit(limit)
      : [];

    let githubDocs = await searchMulti([q], 10);

    if (githubDocs.length > 0) {
      const enriched = await Promise.all(
        githubDocs.slice(0, 5).map(async (d) => {
          const [owner, repo] = d.slug.split("/");
          if (owner && repo) d.readme = await fetchReadme(owner, repo);
          try {
            const caps = await extractCapabilities(d);
            d.capabilities = caps.capabilities;
            d.primitives = caps.primitives;
          } catch (e) {
            logger.warn({ err: e, slug: d.slug }, "Capability extraction failed");
          }
          return d;
        }),
      );

      for (const doc of enriched) {
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
          })
          .onConflictDoUpdate({
            target: repos.slug,
            set: {
              name: doc.name,
              url: doc.url,
              description: doc.description ?? undefined,
              readme: doc.readme || undefined,
              language: doc.language ?? undefined,
              topics: doc.topics?.length ? doc.topics : undefined,
              stars: doc.stars ?? undefined,
              capabilities: doc.capabilities?.length ? doc.capabilities : undefined,
              primitives: doc.primitives?.length ? doc.primitives : undefined,
              updatedAt: new Date(),
            },
          });
      }

      try {
        await upsertVectors(enriched);
      } catch (e) {
        logger.warn({ err: e }, "Vector upsert failed in repos/search");
      }

      githubDocs = enriched;
    }

    const seen = new Set<string>();
    const merged = [...localRows, ...githubDocs].filter((r) => {
      if (seen.has(r.slug)) return false;
      seen.add(r.slug);
      return true;
    });

    return apiResponse(
      merged.slice(0, limit).map((r) => ({
        slug: r.slug,
        name: r.name,
        url: r.url,
        description: r.description ?? "",
        language: r.language ?? null,
        topics: r.topics ?? [],
        stars: r.stars ?? 0,
        capabilities: r.capabilities ?? [],
        primitives: r.primitives ?? [],
      })),
    );
  } catch (e) {
    logger.error({ err: e, query: q }, "repos/search failed");
    return apiError("Repo search failed", 500);
  }
}
