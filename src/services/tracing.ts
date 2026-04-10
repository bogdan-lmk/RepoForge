import { db } from "@/db";
import { retrievalTraces } from "@/db/schema";
import { env } from "@/env";
import type { ParsedQuery } from "@/core/types";

export interface TraceInput {
  queryText: string;
  parsed: ParsedQuery;
  ftsCount: number;
  vectorCount: number;
  githubCount: number;
  githubTriggered: boolean;
  mergedCount: number;
  rerankedCount: number;
  topSlugs: string[];
  scores: number[];
  latencyMs: {
    fts: number;
    vector: number;
    github: number | null;
    total: number;
  };
}

export async function persistTrace(input: TraceInput): Promise<void> {
  const { scoreP50, scoreP90 } = computePercentiles(input.scores);

  await db.insert(retrievalTraces).values({
    queryText: input.queryText,
    intentType: input.parsed.intentType,
    queryType: input.parsed.queryType,
    vectorMode: env.VECTOR_MODE,
    ftsCount: input.ftsCount,
    vectorCount: input.vectorCount,
    githubCount: input.githubCount,
    githubTriggered: input.githubTriggered,
    mergedCount: input.mergedCount,
    rerankedCount: input.rerankedCount,
    topSlugs: input.topSlugs,
    scoreP50,
    scoreP90,
    latencyFtsMs: Math.round(input.latencyMs.fts),
    latencyVectorMs: Math.round(input.latencyMs.vector),
    latencyGithubMs: input.latencyMs.github !== null ? Math.round(input.latencyMs.github) : null,
    latencyTotalMs: Math.round(input.latencyMs.total),
  });
}

function computePercentiles(scores: number[]): { scoreP50: number | null; scoreP90: number | null } {
  if (!scores.length) return { scoreP50: null, scoreP90: null };

  const sorted = [...scores].sort((a, b) => a - b);

  return {
    scoreP50: percentile(sorted, 50),
    scoreP90: percentile(sorted, 90),
  };
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const frac = idx - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}
