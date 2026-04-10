import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyHumanOverrides,
  loadHumanOverrides,
  summarizeComboJudge,
  type ComboJudgeRunItem,
} from "@/services/eval/combo-eval";

function makeItem(overrides: Partial<ComboJudgeRunItem> = {}) {
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

  it("applies human overrides on top of model judgments", () => {
    const items = [
      makeItem({
        verdict: "baseline_wins",
        rationale: "Model preferred the baseline.",
      }),
    ];

    const updated = applyHumanOverrides(items, [
      {
        queryId: "c1",
        verdict: "candidate_wins",
        rationale: "Human reviewer accepted the candidate after checking repo fit.",
        candidate: {
          repo_fit: 5,
          clarity: 5,
        },
      },
    ]);

    expect(updated).toHaveLength(1);
    expect(updated[0]?.verdict).toBe("candidate_wins");
    expect(updated[0]?.rationale).toContain("Human reviewer");
    expect(updated[0]?.candidate.repo_fit).toBe(5);
    expect(updated[0]?.candidate.clarity).toBe(5);
    expect(items[0]?.verdict).toBe("baseline_wins");
    expect(items[0]?.candidate.clarity).toBe(4);
  });

  it("loads human overrides from json", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "combo-eval-"));
    const filePath = path.join(tempDir, "human-overrides.json");

    await writeFile(
      filePath,
      JSON.stringify([
        {
          queryId: "c_capability_rag",
          verdict: "tie",
          rationale: "Human reviewer marked both outputs as equivalent.",
          baseline: { clarity: 4 },
        },
      ]),
      "utf8",
    );

    const overrides = await loadHumanOverrides(filePath);

    expect(overrides).toEqual([
      {
        queryId: "c_capability_rag",
        verdict: "tie",
        rationale: "Human reviewer marked both outputs as equivalent.",
        baseline: { clarity: 4 },
      },
    ]);
  });
});
