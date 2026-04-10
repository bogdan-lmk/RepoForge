import { describe, expect, it } from "vitest";
import {
  compareBenchRuns,
  summarizeBenchRun,
  type RetrievalBenchRun,
} from "@/services/eval/retrieval-bench";

function makeScore(overrides: Partial<RetrievalBenchRun["scores"][number]> = {}) {
  return {
    queryId: "q1",
    query: "test query",
    topSlugs: ["foo/bar"],
    precisionAt5: 0.2,
    precisionAt10: 0.1,
    reciprocalRank: 0.5,
    firstRelevantRank: 2,
    ndcgAt10: 0.4,
    badInTop5: 0,
    relevantInTop5: 1,
    relevantInTop10: 1,
    ...overrides,
  };
}

describe("retrieval bench", () => {
  it("summarizes a bench run with median latency", () => {
    const run = summarizeBenchRun(
      "hybrid",
      [
        makeScore(),
        makeScore({ queryId: "q2", reciprocalRank: 1, ndcgAt10: 0.8, precisionAt5: 0.4 }),
      ],
      [40, 10, 25],
    );

    expect(run.mode).toBe("hybrid");
    expect(run.medianLatencyMs).toBe(25);
    expect(run.metrics.avgMRR).toBe(0.75);
  });

  it("keeps a candidate when relevance improves within latency budget", () => {
    const baseline = summarizeBenchRun(
      "hybrid",
      [makeScore(), makeScore({ queryId: "q2", reciprocalRank: 0.25, ndcgAt10: 0.2 })],
      [100, 110],
    );
    const candidate = summarizeBenchRun(
      "hybrid+rerank",
      [makeScore({ reciprocalRank: 1, ndcgAt10: 0.7 }), makeScore({ queryId: "q2", reciprocalRank: 0.5, ndcgAt10: 0.5 })],
      [120, 130],
    );

    const comparison = compareBenchRuns(baseline, candidate);

    expect(comparison.decision).toBe("keep");
    expect(comparison.improvedQueries).toBe(2);
  });

  it("kills a candidate when uplift is too small", () => {
    const baseline = summarizeBenchRun(
      "hybrid",
      [makeScore(), makeScore({ queryId: "q2" })],
      [100, 100],
    );
    const candidate = summarizeBenchRun(
      "vector-only",
      [makeScore({ reciprocalRank: 0.51, ndcgAt10: 0.401 }), makeScore({ queryId: "q2", reciprocalRank: 0.5, ndcgAt10: 0.401 })],
      [105, 105],
    );

    const comparison = compareBenchRuns(baseline, candidate);

    expect(comparison.decision).toBe("kill");
    expect(comparison.notes[0]).toContain("minimum relevance uplift");
  });
});
