import { db, combos } from "@/db";
import { desc, eq } from "drizzle-orm";
import { apiResponse, apiError } from "@/core/api-helpers";
import { mapComboToApi } from "@/core/mappers";
import { logger } from "@/lib/logger";
import { z } from "zod";

const comboScoresSchema = z.object({
  novelty: z.number().min(0).max(1).nullable().optional(),
  composableFit: z.number().min(0).max(1).nullable().optional(),
  accessibilityWedge: z.number().min(0).max(1).nullable().optional(),
  timeToDemo: z.number().min(0).max(1).nullable().optional(),
  categoryUpside: z.number().min(0).max(1).nullable().optional(),
  narrativeClarity: z.number().min(0).max(1).nullable().optional(),
}).default({});

const comboInputSchema = z.object({
  title: z.string().trim().min(1),
  thesis: z.string().trim().min(1),
  formula: z.string().nullable().optional(),
  repoSlugs: z.array(z.string()).default([]),
  repoRoles: z.record(z.string(), z.string()).default({}),
  steps: z.array(z.string()).default([]),
  recommendedShell: z.string().default("web"),
  whatIsBeingCombined: z.string().nullable().optional(),
  capabilities: z.array(z.string()).default([]),
  supportingPrimitives: z.array(z.string()).default([]),
  whyFit: z.string().nullable().optional(),
  useCase: z.string().nullable().optional(),
  whyBetterThanSingle: z.string().nullable().optional(),
  firstUser: z.string().nullable().optional(),
  demo72h: z.string().nullable().optional(),
  keyRisks: z.array(z.string()).default([]),
  scores: comboScoresSchema,
  queryText: z.string().nullable().optional(),
});

function normalizeScores(
  scores: z.infer<typeof comboScoresSchema>,
) {
  return {
    novelty: scores.novelty ?? undefined,
    composableFit: scores.composableFit ?? undefined,
    accessibilityWedge: scores.accessibilityWedge ?? undefined,
    timeToDemo: scores.timeToDemo ?? undefined,
    categoryUpside: scores.categoryUpside ?? undefined,
    narrativeClarity: scores.narrativeClarity ?? undefined,
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const savedOnly = url.searchParams.get("saved") === "true";

    const query = db
      .select()
      .from(combos)
      .orderBy(desc(combos.createdAt))
      .limit(50);

    const rows = savedOnly
      ? await query.where(eq(combos.saved, true))
      : await query;

    return apiResponse(rows.map(mapComboToApi));
  } catch (e) {
    logger.error({ err: e }, "GET /api/combos failed");
    return apiError("Failed to fetch combos", 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = comboInputSchema.parse(body);

    const [created] = await db
      .insert(combos)
      .values({
        title: input.title,
        thesis: input.thesis,
        formula: input.formula ?? null,
        repoSlugs: input.repoSlugs,
        repoRoles: input.repoRoles,
        steps: input.steps,
        recommendedShell: input.recommendedShell,
        whatIsBeingCombined: input.whatIsBeingCombined ?? null,
        capabilities: input.capabilities,
        supportingPrimitives: input.supportingPrimitives,
        whyFit: input.whyFit ?? null,
        useCase: input.useCase ?? null,
        whyBetterThanSingle: input.whyBetterThanSingle ?? null,
        firstUser: input.firstUser ?? null,
        demo72h: input.demo72h ?? null,
        keyRisks: input.keyRisks,
        scores: normalizeScores(input.scores),
        queryText: input.queryText ?? null,
        saved: true,
      })
      .returning();

    return apiResponse(mapComboToApi(created), 201);
  } catch (e) {
    logger.error({ err: e }, "POST /api/combos failed");
    return apiError("Failed to save combo", 500);
  }
}
