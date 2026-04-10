import { readFile } from "node:fs/promises";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { env } from "@/env";
import type { RepoDoc } from "@/core/types";
import { comboDraftListSchema } from "@/core/schemas";

const openai = createOpenAI({
  apiKey: env.OPENAI_API_KEY,
  baseURL: env.OPENAI_BASE_URL,
});

const comboJudgeQuerySchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  notes: z.string().default(""),
});

const rubricScoresSchema = z.object({
  repo_fit: z.number().int().min(1).max(5),
  novelty: z.number().int().min(1).max(5),
  clarity: z.number().int().min(1).max(5),
  theoretical_plausibility: z.number().int().min(1).max(5),
  signal_value: z.number().int().min(1).max(5),
});

const pairwiseJudgeSchema = z.object({
  verdict: z.enum(["baseline_wins", "candidate_wins", "tie"]),
  baseline: rubricScoresSchema,
  candidate: rubricScoresSchema,
  rationale: z.string(),
});

export type ComboJudgeQuery = z.infer<typeof comboJudgeQuerySchema>;
export type ComboJudgeScores = z.infer<typeof rubricScoresSchema>;
export type ComboJudgeVerdict = z.infer<typeof pairwiseJudgeSchema>;

export type ComboJudgeRunItem = {
  queryId: string;
  query: string;
  verdict: ComboJudgeVerdict["verdict"];
  baseline: ComboJudgeScores;
  candidate: ComboJudgeScores;
  rationale: string;
};

export type ComboJudgeSummary = {
  queryCount: number;
  baselineAverage: ComboJudgeScores;
  candidateAverage: ComboJudgeScores;
  pairwiseWinRate: number;
  baselineClarityFloor: number;
  candidateClarityFloor: number;
  baselineRepoFitFloor: number;
  candidateRepoFitFloor: number;
  decision: "keep" | "kill" | "investigate";
  notes: string[];
};

const COMBO_SYSTEM_PREFIX = `You combine open-source repos into product ideas.
Return structured JSON only.
Use the provided repo context. Avoid inventing repo capabilities that are not evidenced in the repo list.`;

const JUDGE_SYSTEM = `You are judging two alternative combo-generation outputs for the same query.
Score each side from 1-5 on repo_fit, novelty, clarity, theoretical_plausibility, and signal_value.
Prefer credible, repo-grounded, non-generic outputs.
Return structured JSON only.`;

function parseJsonLine(line: string) {
  return JSON.parse(line) as unknown;
}

export async function loadComboJudgeQueries(filePath: string) {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => comboJudgeQuerySchema.parse(parseJsonLine(line)));
}

export async function loadPromptVariant(filePath: string) {
  return (await readFile(filePath, "utf8")).trim();
}

export async function generateVariantCombos(
  query: string,
  repos: RepoDoc[],
  promptVariant: string,
  limit = 3,
) {
  const repoSummaries = repos
    .slice(0, 10)
    .map((repo) => {
      const capabilities = repo.capabilities.length
        ? ` capabilities=${repo.capabilities.slice(0, 5).join("; ")}`
        : "";
      const primitives = repo.primitives.length
        ? ` primitives=${repo.primitives.slice(0, 5).join("; ")}`
        : "";
      return `- ${repo.slug}: ${repo.description}${capabilities}${primitives}`;
    })
    .join("\n");

  const { object } = await generateObject({
    model: openai(env.OPENAI_MODEL),
    schema: comboDraftListSchema,
    system: `${COMBO_SYSTEM_PREFIX}\n\n${promptVariant}`,
    prompt: `Query: "${query}"\n\nAvailable repos:\n${repoSummaries}\n\nGenerate exactly ${limit} combos.`,
  });

  return object.combos;
}

export async function judgeComboVariants(input: {
  query: string;
  notes?: string;
  repos: RepoDoc[];
  baselineOutput: unknown;
  candidateOutput: unknown;
}) {
  const repoContext = input.repos
    .slice(0, 10)
    .map((repo) => `- ${repo.slug}: ${repo.description}`)
    .join("\n");

  const { object } = await generateObject({
    model: openai(env.OPENAI_MODEL),
    schema: pairwiseJudgeSchema,
    system: JUDGE_SYSTEM,
    prompt: [
      `Query: "${input.query}"`,
      input.notes ? `Notes: ${input.notes}` : null,
      "Repo context:",
      repoContext,
      "",
      "Baseline output:",
      JSON.stringify(input.baselineOutput, null, 2),
      "",
      "Candidate output:",
      JSON.stringify(input.candidateOutput, null, 2),
    ].filter(Boolean).join("\n"),
  });

  return object;
}

export function summarizeComboJudge(items: ComboJudgeRunItem[]): ComboJudgeSummary {
  if (items.length === 0) {
    const zeros = zeroScores();
    return {
      queryCount: 0,
      baselineAverage: zeros,
      candidateAverage: zeros,
      pairwiseWinRate: 0,
      baselineClarityFloor: 0,
      candidateClarityFloor: 0,
      baselineRepoFitFloor: 0,
      candidateRepoFitFloor: 0,
      decision: "investigate",
      notes: ["No judged items were available."],
    };
  }

  const baselineAverage = averageScores(items.map((item) => item.baseline));
  const candidateAverage = averageScores(items.map((item) => item.candidate));
  const pairwiseWins = items.filter((item) => item.verdict === "candidate_wins").length;
  const pairwiseWinRate = round(pairwiseWins / items.length);
  const baselineClarityFloor = Math.min(...items.map((item) => item.baseline.clarity));
  const candidateClarityFloor = Math.min(...items.map((item) => item.candidate.clarity));
  const baselineRepoFitFloor = Math.min(...items.map((item) => item.baseline.repo_fit));
  const candidateRepoFitFloor = Math.min(...items.map((item) => item.candidate.repo_fit));

  const notes: string[] = [];
  let decision: ComboJudgeSummary["decision"] = "investigate";

  if (
    pairwiseWinRate >= 0.6 &&
    candidateAverage.repo_fit >= baselineAverage.repo_fit &&
    candidateAverage.clarity >= baselineAverage.clarity - 0.2
  ) {
    decision = "keep";
    notes.push("Candidate clears pairwise and floor checks.");
  } else if (
    candidateAverage.repo_fit < baselineAverage.repo_fit ||
    candidateAverage.clarity < baselineAverage.clarity - 0.2
  ) {
    decision = "kill";
    notes.push("Candidate drops repo fit or clarity below the allowed threshold.");
  } else if (pairwiseWinRate < 0.6) {
    decision = "kill";
    notes.push("Candidate did not win often enough in pairwise judging.");
  } else {
    notes.push("Candidate changes the profile, but needs manual review.");
  }

  return {
    queryCount: items.length,
    baselineAverage,
    candidateAverage,
    pairwiseWinRate,
    baselineClarityFloor,
    candidateClarityFloor,
    baselineRepoFitFloor,
    candidateRepoFitFloor,
    decision,
    notes,
  };
}

function averageScores(scores: ComboJudgeScores[]) {
  const totals = scores.reduce(
    (acc, score) => ({
      repo_fit: acc.repo_fit + score.repo_fit,
      novelty: acc.novelty + score.novelty,
      clarity: acc.clarity + score.clarity,
      theoretical_plausibility: acc.theoretical_plausibility + score.theoretical_plausibility,
      signal_value: acc.signal_value + score.signal_value,
    }),
    zeroScores(),
  );

  return {
    repo_fit: round(totals.repo_fit / scores.length),
    novelty: round(totals.novelty / scores.length),
    clarity: round(totals.clarity / scores.length),
    theoretical_plausibility: round(totals.theoretical_plausibility / scores.length),
    signal_value: round(totals.signal_value / scores.length),
  };
}

function zeroScores() {
  return {
    repo_fit: 0,
    novelty: 0,
    clarity: 0,
    theoretical_plausibility: 0,
    signal_value: 0,
  };
}

function round(value: number) {
  return Number(value.toFixed(4));
}
