import { db, repos } from "@/db";
import { desc } from "drizzle-orm";
import { apiResponse, apiError } from "@/core/api-helpers";
import { mapRepoToApi } from "@/core/mappers";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(repos)
      .orderBy(desc(repos.stars))
      .limit(50);

    return apiResponse(rows.map(mapRepoToApi));
  } catch (e) {
    logger.error({ err: e }, "GET /api/repos failed");
    return apiError("Failed to fetch repos", 500);
  }
}
