import { db, repos } from "@/db";
import { desc, sql } from "drizzle-orm";
import { apiResponse, apiError } from "@/core/api-helpers";
import { mapRepoToApi } from "@/core/mappers";
import { logger } from "@/lib/logger";
import { fetchTrending } from "@/lib/ossinsight";

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(repos)
      .where(sql`${repos.trendScore} IS NOT NULL`)
      .orderBy(desc(repos.trendScore))
      .limit(24);

    if (rows.length > 0) {
      return apiResponse(rows.map(mapRepoToApi));
    }

    logger.info("Trending DB empty, falling back to OSSInsight live data");
    const trending = await fetchTrending(24);
    return apiResponse(
      trending.map((t) => ({
        slug: t.slug,
        name: t.name,
        url: `https://github.com/${t.slug}`,
        description: null,
        language: null,
        topics: [],
        stars: t.stars,
        starsDelta30d: 0,
        trendScore: String(t.trendScore ?? 0),
        sourceRank: 0,
        capabilities: [],
        primitives: [],
        discoveredAt: new Date().toISOString(),
      })),
    );
  } catch (e) {
    logger.error({ err: e }, "GET /api/repos/trending failed");
    return apiError("Failed to fetch trending repos", 500);
  }
}
