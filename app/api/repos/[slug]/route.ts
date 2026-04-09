import { NextRequest } from "next/server";
import { db, repos } from "@/db";
import { fetchSourceRank } from "@/lib/librariesio";
import { eq } from "drizzle-orm";
import { apiResponse, apiError } from "@/core/api-helpers";
import { mapRepoToApi } from "@/core/mappers";
import { logger } from "@/lib/logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const rows = await db
      .select()
      .from(repos)
      .where(eq(repos.slug, decodeURIComponent(slug)))
      .limit(1);

    if (!rows.length) {
      return apiError("Repo not found", 404);
    }

    const repo = rows[0];
    const sourceRank =
      repo.sourceRank || (await fetchSourceRank(repo.slug))?.sourceRank || 0;

    return apiResponse({
      ...mapRepoToApi(repo),
      readme: repo.readme,
      sourceRank,
    });
  } catch (e) {
    logger.error({ err: e }, "GET /api/repos/[slug] failed");
    return apiError("Failed to fetch repo", 500);
  }
}
