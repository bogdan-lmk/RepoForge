/**
 * POST /api/reindex
 *
 * Re-indexes ALL repos from PostgreSQL into Qdrant with the current
 * embedding scheme (slug + name + topics + capabilities + description + readme[:1500]).
 *
 * Run this after changing buildEmbedText in qdrant.ts, e.g. when README
 * was added to the embedding. Safe to call multiple times — it drops and
 * recreates the Qdrant collection.
 *
 * Protected by a secret token to prevent accidental/malicious triggering.
 * Set REINDEX_SECRET in your environment variables.
 */

import { NextRequest } from "next/server";
import { db, repos } from "@/db";
import { reindexAll } from "@/lib/qdrant";
import { logger } from "@/lib/logger";
import { apiResponse, apiError } from "@/core/api-helpers";
import type { RepoDoc } from "@/core/types";

export async function POST(req: NextRequest) {
  // Simple secret-token auth — add REINDEX_SECRET to your .env
  const secret = process.env.REINDEX_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return apiError("Unauthorized", 401);
    }
  }

  try {
    // Fetch all repos from PostgreSQL (select only fields needed for embedding)
    const rows = await db
      .select({
        id: repos.id,
        slug: repos.slug,
        name: repos.name,
        url: repos.url,
        description: repos.description,
        readme: repos.readme,
        language: repos.language,
        topics: repos.topics,
        stars: repos.stars,
        capabilities: repos.capabilities,
        primitives: repos.primitives,
      })
      .from(repos);

    const repoDocs: RepoDoc[] = rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      url: r.url,
      description: r.description ?? "",
      readme: r.readme ?? "",
      language: r.language,
      topics: (r.topics as string[]) ?? [],
      stars: r.stars ?? 0,
      capabilities: (r.capabilities as string[]) ?? [],
      primitives: (r.primitives as string[]) ?? [],
    }));

    logger.info({ count: repoDocs.length }, "Starting re-index from API");

    // Non-blocking: respond immediately, re-index in background
    // (Vercel serverless max duration: use a queue for large datasets in prod)
    reindexAll(repoDocs).catch((e) =>
      logger.error({ err: e }, "Background re-index failed"),
    );

    return apiResponse({
      message: `Re-index started for ${repoDocs.length} repos. Check server logs for progress.`,
      count: repoDocs.length,
    });
  } catch (e) {
    logger.error({ err: e }, "Failed to start re-index");
    return apiError("Re-index failed to start", 500);
  }
}
