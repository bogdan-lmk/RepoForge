import { db, repos } from "@/db";
import { desc, sql } from "drizzle-orm";
import { apiResponse, apiError } from "@/core/api-helpers";
import { mapRepoToApi } from "@/core/mappers";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(repos)
      .where(sql`${repos.trendScore} IS NOT NULL`)
      .orderBy(desc(repos.trendScore))
      .limit(24);

    return apiResponse(rows.map(mapRepoToApi));
  } catch (e) {
    logger.error({ err: e }, "GET /api/repos/trending failed");
    return apiError("Failed to fetch trending repos", 500);
  }
}
