import { describe, expect, it } from "vitest";
import { loadEvalQueries, scoreEvalQuery, summarizeQueryLab } from "@/services/eval/query-lab";
import type { EvalQuery } from "../../evals/query-lab/schema";

function makeQuery(overrides: Partial<EvalQuery> = {}): EvalQuery {
  return {
    id: "q_test",
    query: "rag chatbot framework",
    query_type: "capability_search",
    must_have: ["langchain-ai/langchain"],
    good_candidates: ["chroma-core/chroma", "run-llama/llama_index"],
    bad_candidates: ["facebook/react"],
    notes: "RAG stack, not frontend UI",
    ...overrides,
  };
}

describe("query lab scoring", () => {
  it("loads eval queries from jsonl", async () => {
    const queries = await loadEvalQueries("evals/query-lab/queries.jsonl");

    expect(queries.length).toBeGreaterThanOrEqual(30);
    expect(queries[0]).toHaveProperty("id");
    expect(queries[0]).toHaveProperty("query");
  });

  it("computes ranking metrics for a query", () => {
    const score = scoreEvalQuery(makeQuery(), [
      "facebook/react",
      "langchain-ai/langchain",
      "chroma-core/chroma",
      "vercel/next.js",
    ]);

    expect(score.precisionAt5).toBeCloseTo(0.4, 5);
    expect(score.precisionAt10).toBeCloseTo(0.2, 5);
    expect(score.reciprocalRank).toBeCloseTo(0.5, 5);
    expect(score.firstRelevantRank).toBe(2);
    expect(score.badInTop5).toBe(1);
    expect(score.ndcgAt10).toBeGreaterThan(0);
  });

  it("summarizes multiple query scores", () => {
    const summary = summarizeQueryLab([
      scoreEvalQuery(makeQuery({ id: "q1" }), [
        "langchain-ai/langchain",
        "chroma-core/chroma",
      ]),
      scoreEvalQuery(makeQuery({ id: "q2" }), [
        "facebook/react",
        "vercel/next.js",
      ]),
    ]);

    expect(summary.queryCount).toBe(2);
    expect(summary.avgPrecisionAt5).toBeGreaterThan(0);
    expect(summary.avgMRR).toBeGreaterThan(0);
    expect(summary.queriesWithoutRelevant).toBe(1);
  });
});
