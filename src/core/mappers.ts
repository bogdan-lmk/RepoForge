import type { Repo, Combo } from "@/db/schema";
import type { ComboDraft } from "@/core/schemas";

export function mapRepoToApi(r: Repo) {
  return {
    slug: r.slug,
    name: r.name,
    url: r.url,
    description: r.description,
    language: r.language,
    topics: r.topics ?? [],
    stars: r.stars ?? 0,
    starsDelta30d: r.starsDelta30d ?? 0,
    trendScore: r.trendScore ?? null,
    sourceRank: r.sourceRank ?? 0,
    capabilities: r.capabilities ?? [],
    primitives: r.primitives ?? [],
    discoveredAt: r.discoveredAt,
  };
}

export function mapComboToApi(c: Combo) {
  return {
    id: c.id,
    title: c.title,
    thesis: c.thesis,
    formula: c.formula,
    repoSlugs: c.repoSlugs ?? [],
    recommendedShell: c.recommendedShell ?? "web",
    whatIsBeingCombined: c.whatIsBeingCombined,
    capabilities: c.capabilities ?? [],
    supportingPrimitives: c.supportingPrimitives ?? [],
    whyFit: c.whyFit,
    useCase: c.useCase,
    whyBetterThanSingle: c.whyBetterThanSingle,
    firstUser: c.firstUser,
    demo72h: c.demo72h,
    keyRisks: c.keyRisks ?? [],
    scores: c.scores ?? {},
    saved: c.saved,
    queryText: c.queryText,
    createdAt: c.createdAt,
  };
}

export function mapComboDraftToApi(draft: ComboDraft) {
  return {
    title: draft.title,
    thesis: draft.thesis,
    formula: draft.formula,
    repoSlugs: draft.repo_slugs,
    repoRoles: Array.isArray(draft.repo_roles)
      ? Object.fromEntries(
          (draft.repo_roles as Array<{ repo: string; role: string }>).map((r) => [r.repo, r.role]),
        )
      : {},
    steps: draft.steps,
    recommendedShell: draft.recommended_shell ?? "web",
    whatIsBeingCombined: draft.what_is_being_combined,
    capabilities: draft.capabilities,
    supportingPrimitives: draft.supporting_primitives,
    whyFit: draft.why_fit,
    useCase: draft.use_case,
    whyBetterThanSingle: draft.why_better_than_single,
    firstUser: draft.first_user,
    demo72h: draft.demo_72h,
    keyRisks: draft.key_risks,
    scores: {
      novelty: draft.novelty,
      composableFit: draft.composable_fit,
      accessibilityWedge: draft.accessibility_wedge,
      timeToDemo: draft.time_to_demo,
      categoryUpside: draft.category_upside,
      narrativeClarity: draft.narrative_clarity,
    },
  };
}
