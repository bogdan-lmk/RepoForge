import { describe, expect, it } from "vitest";
import { summarizeComboJudge } from "@/services/eval/combo-eval";

function makeItem(overrides: Partial<Parameters<typeof summarizeComboJudge>[0][number]> = {}) {
  return {
    queryId: "c1",
    query: "langchain framework for ai agents",
    verdict: "candidate_wins" as const,
    rationale: "Candidate is clearer and more grounded.",
    baseline: {
      repo_fit: 4,
      novelty: 3,
      clarity: 4,
      theoretical_plausibility: 4,
      signal_value: 3,
    },
    candidate: {
      repo_fit: 5,
      novelty: 4,
      clarity: 4,
      theoretical_plausibility: 4,
      signal_value: 4,
    },
    ...overrides,
  };
}

describe("combo eval", () => {
  it("keeps a candidate that wins pairwise and preserves quality floors", () => {
    const summary = summarizeComboJudge([
      makeItem(),
      makeItem({
        queryId: "c2",
        baseline: { repo_fit: 4, novelty: 3, clarity: 4, theoretical_plausibility: 3, signal_value: 3 },
        candidate: { repo_fit: 4, novelty: 4, clarity: 4, theoretical_plausibility: 4, signal_value: 4 },
      }),
    ]);

    expect(summary.decision).toBe("keep");
    expect(summary.pairwiseWinRate).toBe(1);
  });

  it("kills a candidate that drops repo fit", () => {
    const summary = summarizeComboJudge([
      makeItem({
        verdict: "candidate_wins",
        baseline: { repo_fit: 5, novelty: 3, clarity: 4, theoretical_plausibility: 4, signal_value: 3 },
        candidate: { repo_fit: 3, novelty: 5, clarity: 4, theoretical_plausibility: 4, signal_value: 4 },
      }),
    ]);

    expect(summary.decision).toBe("kill");
    expect(summary.notes[0]).toContain("repo fit");
  });
});
