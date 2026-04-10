import { readFile } from "node:fs/promises";
import { evalQuerySchema, type EvalQuery } from "../../../evals/query-lab/schema.ts";

export type QueryLabScore = {
  queryId: string;
  query: string;
  topSlugs: string[];
  precisionAt5: number;
  precisionAt10: number;
  reciprocalRank: number;
  firstRelevantRank: number | null;
  ndcgAt10: number;
  badInTop5: number;
  relevantInTop5: number;
  relevantInTop10: number;
};

export type QueryLabSummary = {
  queryCount: number;
  avgPrecisionAt5: number;
  avgPrecisionAt10: number;
  avgMRR: number;
  avgNdcgAt10: number;
  avgBadInTop5: number;
  queriesWithoutRelevant: number;
};

function parseJsonLine(line: string) {
  return JSON.parse(line) as unknown;
}

export async function loadEvalQueries(filePath: string) {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => evalQuerySchema.parse(parseJsonLine(line)));
}

function relevanceMap(query: EvalQuery) {
  const map = new Map<string, number>();

  for (const slug of query.good_candidates) {
    map.set(slug.toLowerCase(), 1);
  }

  for (const slug of query.must_have) {
    map.set(slug.toLowerCase(), 3);
  }

  return map;
}

function precisionAt(topSlugs: string[], relevant: Set<string>, k: number) {
  let hits = 0;

  for (const slug of topSlugs.slice(0, k)) {
    if (relevant.has(slug.toLowerCase())) {
      hits++;
    }
  }

  return hits / k;
}

function reciprocalRank(topSlugs: string[], relevant: Set<string>) {
  const first = topSlugs.findIndex((slug) => relevant.has(slug.toLowerCase()));
  return first === -1 ? 0 : 1 / (first + 1);
}

function firstRelevantRank(topSlugs: string[], relevant: Set<string>) {
  const first = topSlugs.findIndex((slug) => relevant.has(slug.toLowerCase()));
  return first === -1 ? null : first + 1;
}

function dcgAt(topSlugs: string[], gains: Map<string, number>, k: number) {
  return topSlugs.slice(0, k).reduce((score, slug, index) => {
    const gain = gains.get(slug.toLowerCase()) ?? 0;
    if (gain === 0) {
      return score;
    }

    return score + (2 ** gain - 1) / Math.log2(index + 2);
  }, 0);
}

function idcgAt(query: EvalQuery, k: number) {
  const ordered = [
    ...query.must_have.map(() => 3),
    ...query.good_candidates.map(() => 1),
  ]
    .sort((a, b) => b - a)
    .slice(0, k);

  return ordered.reduce((score, gain, index) => {
    return score + (2 ** gain - 1) / Math.log2(index + 2);
  }, 0);
}

export function scoreEvalQuery(query: EvalQuery, topSlugs: string[]): QueryLabScore {
  const relevant = new Set(
    [...query.must_have, ...query.good_candidates].map((slug) => slug.toLowerCase()),
  );
  const bad = new Set(query.bad_candidates.map((slug) => slug.toLowerCase()));
  const gains = relevanceMap(query);

  const relevantInTop5 = topSlugs
    .slice(0, 5)
    .filter((slug) => relevant.has(slug.toLowerCase())).length;
  const relevantInTop10 = topSlugs
    .slice(0, 10)
    .filter((slug) => relevant.has(slug.toLowerCase())).length;
  const badInTop5 = topSlugs
    .slice(0, 5)
    .filter((slug) => bad.has(slug.toLowerCase())).length;

  const ideal = idcgAt(query, 10);
  const dcg = dcgAt(topSlugs, gains, 10);

  return {
    queryId: query.id,
    query: query.query,
    topSlugs,
    precisionAt5: precisionAt(topSlugs, relevant, 5),
    precisionAt10: precisionAt(topSlugs, relevant, 10),
    reciprocalRank: reciprocalRank(topSlugs, relevant),
    firstRelevantRank: firstRelevantRank(topSlugs, relevant),
    ndcgAt10: ideal > 0 ? dcg / ideal : 0,
    badInTop5,
    relevantInTop5,
    relevantInTop10,
  };
}

function round(value: number) {
  return Number(value.toFixed(4));
}

export function summarizeQueryLab(scores: QueryLabScore[]): QueryLabSummary {
  const queryCount = scores.length;
  if (queryCount === 0) {
    return {
      queryCount: 0,
      avgPrecisionAt5: 0,
      avgPrecisionAt10: 0,
      avgMRR: 0,
      avgNdcgAt10: 0,
      avgBadInTop5: 0,
      queriesWithoutRelevant: 0,
    };
  }

  const sum = scores.reduce(
    (acc, score) => {
      acc.p5 += score.precisionAt5;
      acc.p10 += score.precisionAt10;
      acc.mrr += score.reciprocalRank;
      acc.ndcg += score.ndcgAt10;
      acc.bad += score.badInTop5;
      acc.empty += score.firstRelevantRank == null ? 1 : 0;
      return acc;
    },
    { p5: 0, p10: 0, mrr: 0, ndcg: 0, bad: 0, empty: 0 },
  );

  return {
    queryCount,
    avgPrecisionAt5: round(sum.p5 / queryCount),
    avgPrecisionAt10: round(sum.p10 / queryCount),
    avgMRR: round(sum.mrr / queryCount),
    avgNdcgAt10: round(sum.ndcg / queryCount),
    avgBadInTop5: round(sum.bad / queryCount),
    queriesWithoutRelevant: sum.empty,
  };
}
