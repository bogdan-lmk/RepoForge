import { NextRequest } from "next/server";
import { db, repos } from "@/db";
import { searchMulti, fetchReadme } from "@/lib/github";
import { extractCapabilities } from "@/lib/openai";
import { upsertVectors } from "@/lib/qdrant";
import { logger } from "@/lib/logger";
import { or, sql, desc } from "drizzle-orm";
import { apiResponse, apiError } from "@/core/api-helpers";
import { mapRepoToApi } from "@/core/mappers";
import { enforceRateLimit } from "@/core/route-guards";
import { z } from "zod";

const searchReposSchema = z.object({
  q: z.string().trim().min(1),
  limit: z.number().int().min(1).max(50).optional(),
});

function normalizeLimit(
  value: string | number | null | undefined,
  fallback: number,
) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), 50);
}

async function searchLocalRepos(q: string, limit: number) {
  const terms = q.split(/\s+/).filter((t) => t.length > 1);
  const conditions = terms.map((t) =>
    or(
      sql`${repos.slug} ILIKE ${`%${t}%`}`,
      sql`${repos.description} ILIKE ${`%${t}%`}`,
    ),
  );

  if (!conditions.length) {
    return [];
  }

  return db
    .select()
    .from(repos)
    .where(or(...conditions))
    .limit(limit);
}

async function searchAndPersistFromGithub(q: string) {
  let githubDocs = await searchMulti([q], 10);

  if (githubDocs.length === 0) {
    return githubDocs;
  }

  const enriched = await Promise.all(
    githubDocs.slice(0, 5).map(async (doc) => {
      const [owner, repo] = doc.slug.split("/");
      const enrichedDoc = { ...doc };

      if (owner && repo) {
        enrichedDoc.readme = await fetchReadme(owner, repo);
      }

      try {
        const caps = await extractCapabilities(enrichedDoc);
        enrichedDoc.capabilities = caps.capabilities;
        enrichedDoc.primitives = caps.primitives;
      } catch (e) {
        logger.warn({ err: e, slug: enrichedDoc.slug }, "Capability extraction failed");
      }

      return enrichedDoc;
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
  return githubDocs;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const limit = normalizeLimit(req.nextUrl.searchParams.get("limit"), 20);

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
    const localRows = await searchLocalRepos(q, limit);
    return apiResponse(localRows.map(mapRepoToApi));
  } catch (e) {
    logger.error({ err: e, query: q }, "repos/search failed");
    return apiError("Repo search failed", 500);
  }
}

export async function POST(req: NextRequest) {
  const rateLimitError = enforceRateLimit(req, {
    bucket: "repos-search-live",
    limit: 10,
    windowMs: 60_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const body = await req.json();
    const input = searchReposSchema.parse({
      q: body?.q,
      limit: body?.limit,
    });

    const localRows = await searchLocalRepos(input.q, input.limit ?? 20);
    const githubDocs = await searchAndPersistFromGithub(input.q);

    const seen = new Set<string>();
    const merged = [...localRows, ...githubDocs].filter((repo) => {
      if (seen.has(repo.slug)) {
        return false;
      }
      seen.add(repo.slug);
      return true;
    });

    return apiResponse(
      merged.slice(0, input.limit ?? 20).map((repo) => {
        if ("id" in repo) {
          return mapRepoToApi(repo);
        }

        return {
          slug: repo.slug,
          name: repo.name,
          url: repo.url,
          description: repo.description,
          language: repo.language,
          topics: repo.topics,
          stars: repo.stars,
          starsDelta30d: 0,
          trendScore: null,
          sourceRank: 0,
          capabilities: repo.capabilities,
          primitives: repo.primitives,
          discoveredAt: new Date().toISOString(),
        };
      }),
    );
  } catch (e) {
    logger.error({ err: e }, "POST /api/repos/search failed");
    return apiError("Repo search failed", 500);
  }
}
