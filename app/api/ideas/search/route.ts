import { NextRequest } from "next/server";
import { search } from "@/services/search";
import { db, combos } from "@/db";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { apiResponse, apiError } from "@/core/api-helpers";
import { mapComboDraftToApi } from "@/core/mappers";
import type { ComboDraft } from "@/core/schemas";
import { enforceRateLimit } from "@/core/route-guards";
import { z } from "zod";

const searchIdeasSchema = z.object({
  q: z.string().trim().min(1),
  limit: z.number().int().min(1).max(5).optional(),
});

function normalizeLimit(value: string | number | null | undefined) {
  const parsed = Number(value ?? 3);
  if (!Number.isFinite(parsed)) {
    return 3;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), 5);
}

async function buildSearchPayload(
  q: string,
  limit: number,
  persistCombos: boolean,
) {
  const result = await search(q, limit);

  const comboIds: Array<number | null> = [];

  if (persistCombos && result.combos.length) {
    for (const combo of result.combos) {
      const c = combo as Record<string, unknown>;
      const title = String(c.title ?? "");
      const [inserted] = await db.insert(combos).values({
        title,
        thesis: String(c.thesis ?? ""),
        formula: (c.formula as string | null) ?? null,
        repoSlugs: (c.repo_slugs as string[] | null) ?? [],
        repoRoles: Array.isArray(c.repo_roles)
          ? Object.fromEntries(
              (c.repo_roles as Array<{ repo: string; role: string }>).map((r) => [r.repo, r.role]),
            )
          : {},
        steps: (c.steps as string[] | null) ?? [],
        recommendedShell: (c.recommended_shell as string | null) ?? "web",
        whatIsBeingCombined: (c.what_is_being_combined as string | null) ?? null,
        capabilities: (c.capabilities as string[] | null) ?? [],
        supportingPrimitives: (c.supporting_primitives as string[] | null) ?? [],
        whyFit: (c.why_fit as string | null) ?? null,
        useCase: (c.use_case as string | null) ?? null,
        whyBetterThanSingle: (c.why_better_than_single as string | null) ?? null,
        firstUser: (c.first_user as string | null) ?? null,
        demo72h: (c.demo_72h as string | null) ?? null,
        keyRisks: (c.key_risks as string[] | null) ?? [],
        scores: {
          novelty: (c.novelty as number | null) ?? undefined,
          composableFit: (c.composable_fit as number | null) ?? undefined,
          accessibilityWedge: (c.accessibility_wedge as number | null) ?? undefined,
          timeToDemo: (c.time_to_demo as number | null) ?? undefined,
          categoryUpside: (c.category_upside as number | null) ?? undefined,
          narrativeClarity: (c.narrative_clarity as number | null) ?? undefined,
        },
        queryText: q,
      }).onConflictDoNothing().returning({ id: combos.id });

      if (inserted?.id) {
        comboIds.push(inserted.id);
      } else {
        const [existing] = await db
          .select({ id: combos.id })
          .from(combos)
          .where(and(eq(combos.queryText, q), eq(combos.title, title)))
          .limit(1);
        comboIds.push(existing?.id ?? null);
      }
    }
  }

  const mappedCombos = (result.combos as ComboDraft[]).map(mapComboDraftToApi);
  comboIds.forEach((id, index) => {
    if (id != null && mappedCombos[index]) {
      (mappedCombos[index] as Record<string, unknown>).id = id;
    }
  });

  return {
    query: result.parsed,
    trace: result.trace,
    repos: result.repos.map((repo) => ({
      slug: repo.slug,
      name: repo.name,
      url: repo.url,
      description: repo.description,
      language: repo.language,
      topics: repo.topics,
      stars: repo.stars,
      capabilities: repo.capabilities,
      primitives: repo.primitives,
      score: repo.score,
      source: repo.source,
    })),
    combos: mappedCombos,
  };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const limit = normalizeLimit(req.nextUrl.searchParams.get("limit"));

  if (!q) {
    return apiError("Missing query parameter `q`", 400);
  }

  try {
    return apiResponse(await buildSearchPayload(q, limit, false));
  } catch (e) {
    logger.error({ err: e, query: q }, "ideas/search failed");
    return apiError("Search failed", 500);
  }
}

export async function POST(req: NextRequest) {
  const rateLimitError = enforceRateLimit(req, {
    bucket: "ideas-search",
    limit: 20,
    windowMs: 60_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const body = await req.json();
    const input = searchIdeasSchema.parse({
      q: body?.q,
      limit: body?.limit,
    });

    return apiResponse(
      await buildSearchPayload(input.q, input.limit ?? 3, true),
    );
  } catch (e) {
    logger.error({ err: e }, "POST /api/ideas/search failed");
    return apiError("Search failed", 500);
  }
}
