import type { SearchMode } from "@/core/types";
import type { EvalQuery } from "../../../evals/query-lab/schema.ts";
import { scoreEvalQuery, summarizeQueryLab, type QueryLabScore } from "@/services/eval/query-lab";

export type RetrievalBenchRun = {
  mode: SearchMode;
  queryCount: number;
  medianLatencyMs: number;
  metrics: ReturnType<typeof summarizeQueryLab>;
  scores: QueryLabScore[];
};

export type RetrievalBenchComparison = {
  baseline: SearchMode;
  candidate: SearchMode;
  queryCount: number;
  baselineMetrics: RetrievalBenchRun["metrics"];
  candidateMetrics: RetrievalBenchRun["metrics"];
  baselineLatencyMs: number;
  candidateLatencyMs: number;
  improvedQueries: number;
  degradedQueries: number;
  unchangedQueries: number;
  improvedPct: number;
  degradedPct: number;
  latencyDeltaPct: number;
  mrrDeltaPct: number;
  ndcgDeltaPct: number;
  decision: "keep" | "kill" | "investigate";
  notes: string[];
};

export function createBenchScore(query: EvalQuery, topSlugs: string[]) {
  return scoreEvalQuery(query, topSlugs);
}

export function summarizeBenchRun(
  mode: SearchMode,
  scores: QueryLabScore[],
  latenciesMs: number[],
): RetrievalBenchRun {
  return {
    mode,
    queryCount: scores.length,
    medianLatencyMs: median(latenciesMs),
    metrics: summarizeQueryLab(scores),
    scores,
  };
}

export function compareBenchRuns(
  baseline: RetrievalBenchRun,
  candidate: RetrievalBenchRun,
): RetrievalBenchComparison {
  const baselineMap = new Map(baseline.scores.map((score) => [score.queryId, score]));
  const candidateMap = new Map(candidate.scores.map((score) => [score.queryId, score]));

  let improvedQueries = 0;
  let degradedQueries = 0;
  let unchangedQueries = 0;

  for (const [queryId, baselineScore] of baselineMap) {
    const candidateScore = candidateMap.get(queryId);
    if (!candidateScore) {
      continue;
    }

    const baselineComposite = compositeScore(baselineScore);
    const candidateComposite = compositeScore(candidateScore);

    if (candidateComposite > baselineComposite) {
      improvedQueries++;
    } else if (candidateComposite < baselineComposite) {
      degradedQueries++;
    } else {
      unchangedQueries++;
    }
  }

  const queryCount = Math.max(baseline.queryCount, candidate.queryCount, 1);
  const mrrDeltaPct = pctDelta(baseline.metrics.avgMRR, candidate.metrics.avgMRR);
  const ndcgDeltaPct = pctDelta(baseline.metrics.avgNdcgAt10, candidate.metrics.avgNdcgAt10);
  const latencyDeltaPct = pctDelta(baseline.medianLatencyMs, candidate.medianLatencyMs);
  const improvedPct = improvedQueries / queryCount;
  const degradedPct = degradedQueries / queryCount;

  const notes: string[] = [];
  let decision: RetrievalBenchComparison["decision"] = "investigate";

  if ((mrrDeltaPct >= 3 || ndcgDeltaPct >= 3) && latencyDeltaPct <= 30) {
    decision = "keep";
    notes.push("Candidate clears uplift threshold without exceeding latency budget.");
  } else if (mrrDeltaPct < 3 && ndcgDeltaPct < 3) {
    decision = "kill";
    notes.push("Candidate did not meet the minimum relevance uplift threshold.");
  } else if (degradedPct > 0.1) {
    decision = "kill";
    notes.push("Candidate regressed on too many judged queries.");
  } else if (latencyDeltaPct > 30) {
    decision = "kill";
    notes.push("Candidate exceeded the latency budget.");
  } else {
    notes.push("Candidate changed the profile, but does not meet keep/kill thresholds cleanly.");
  }

  return {
    baseline: baseline.mode,
    candidate: candidate.mode,
    queryCount,
    baselineMetrics: baseline.metrics,
    candidateMetrics: candidate.metrics,
    baselineLatencyMs: baseline.medianLatencyMs,
    candidateLatencyMs: candidate.medianLatencyMs,
    improvedQueries,
    degradedQueries,
    unchangedQueries,
    improvedPct: round(improvedPct),
    degradedPct: round(degradedPct),
    latencyDeltaPct: round(latencyDeltaPct),
    mrrDeltaPct: round(mrrDeltaPct),
    ndcgDeltaPct: round(ndcgDeltaPct),
    decision,
    notes,
  };
}

function compositeScore(score: QueryLabScore) {
  return (
    score.reciprocalRank * 0.5 +
    score.ndcgAt10 * 0.4 +
    score.precisionAt5 * 0.1
  );
}

function pctDelta(baseline: number, candidate: number) {
  if (baseline === 0) {
    return candidate === 0 ? 0 : 100;
  }

  return ((candidate - baseline) / baseline) * 100;
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) {
    return ordered[middle];
  }

  return round((ordered[middle - 1] + ordered[middle]) / 2);
}

function round(value: number) {
  return Number(value.toFixed(4));
}
