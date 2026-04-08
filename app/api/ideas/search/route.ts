import { NextRequest } from "next/server";
import { search } from "@/services/search";
import { db, combos } from "@/db";
import { logger } from "@/lib/logger";
import { apiResponse, apiError } from "@/core/api-helpers";
import { mapComboDraftToApi } from "@/core/mappers";
import type { ComboDraft } from "@/core/schemas";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 3), 5);

  if (!q) {
    return apiError("Missing query parameter `q`", 400);
  }

  try {
    const result = await search(q, limit);

    if (result.combos.length) {
      for (const combo of result.combos) {
        const c = combo as Record<string, unknown>;
        await db.insert(combos).values({
          title: String(c.title ?? ""),
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
        }).onConflictDoNothing();
      }
    }

    return apiResponse({
      query: result.parsed,
      repos: result.repos.map((r) => ({
        slug: r.slug,
        name: r.name,
        url: r.url,
        description: r.description,
        language: r.language,
        topics: r.topics,
        stars: r.stars,
        capabilities: r.capabilities,
        primitives: r.primitives,
        score: r.score,
        source: r.source,
      })),
      combos: (result.combos as ComboDraft[]).map(mapComboDraftToApi),
    });
  } catch (e) {
    logger.error({ err: e, query: q }, "ideas/search failed");
    return apiError("Search failed", 500);
  }
}
