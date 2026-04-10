/**
 * RetrievelBench — structural eval harness for the retrieval pipeline.
 *
 * Hits real Qdrant + DB. Gated by RUN_RETRIEVAL_BENCH=1 so CI stays fast.
 *
 * Run:
 *   RUN_RETRIEVAL_BENCH=1 npx vitest run src/eval/retrieval-bench.test.ts
 */
import { describe, it, expect } from "vitest";
import { GOLDEN_QUERIES } from "./fixtures/golden-queries";
import type { BenchResult, RetrievalTrace } from "./types";

const RUN_BENCH = process.env.RUN_RETRIEVAL_BENCH === "1";

describe.skipIf(!RUN_BENCH)("RetrievelBench", () => {
  // Lazy import so the module (which reads env vars) is only loaded when the bench runs.
  async function runSearch(queryText: string) {
    const { search } = await import("@/services/search");
    return search(queryText);
  }

  function buildTrace(
    queryText: string,
    result: Awaited<ReturnType<typeof runSearch>>,
    latencyMs: number,
  ): RetrievalTrace {
    const repoScores = result.repos.map((r) => r.score ?? 0).sort((a, b) => a - b);
    const p50 = percentile(repoScores, 50);
    const p90 = percentile(repoScores, 90);

    return {
      queryText,
      intentType: result.parsed.intentType,
      queryType: result.parsed.queryType,
      vectorMode: (process.env.VECTOR_MODE ?? "hybrid") as "hybrid" | "dense-only",
      ftsCount: 0, // not exposed by search() directly; use reranked proxy
      vectorCount: 0,
      githubCount: 0,
      githubTriggered: false,
      mergedCount: result.repos.length,
      rerankedCount: result.repos.length,
      topSlugs: result.repos.slice(0, 5).map((r) => r.slug),
      scoreP50: p50,
      scoreP90: p90,
      latencyMs: {
        fts: 0,
        vector: 0,
        github: null,
        total: latencyMs,
      },
    };
  }

  function assertTrace(trace: RetrievalTrace, query: typeof GOLDEN_QUERIES[number]): string[] {
    const failures: string[] = [];

    if (trace.mergedCount < query.minMergedCount) {
      failures.push(
        `merged results ${trace.mergedCount} < required ${query.minMergedCount}`,
      );
    }
    if (trace.latencyMs.total > query.maxLatencyMs) {
      failures.push(
        `latency ${Math.round(trace.latencyMs.total)}ms > limit ${query.maxLatencyMs}ms`,
      );
    }
    if (trace.rerankedCount === 0) {
      failures.push("reranked result set is empty");
    }

    return failures;
  }

  const results: BenchResult[] = [];

  for (const golden of GOLDEN_QUERIES) {
    it(`[${golden.expectedIntent}/${golden.expectedQueryType}] "${golden.text}"`, async () => {
      const t0 = performance.now();
      const result = await runSearch(golden.text);
      const latencyMs = performance.now() - t0;

      const trace = buildTrace(golden.text, result, latencyMs);
      const failures = assertTrace(trace, golden);
      const passed = failures.length === 0;

      results.push({ query: golden.text, trace, passed, failures });

      // Structural assertions
      expect(result.parsed.intentType, "intent type should be present").toBeTruthy();
      expect(result.repos.length, "should return at least minMergedCount repos").toBeGreaterThanOrEqual(golden.minMergedCount);
      expect(latencyMs, "latency should be within budget").toBeLessThanOrEqual(golden.maxLatencyMs);

      if (failures.length > 0) {
        console.warn(`[BENCH FAIL] "${golden.text}":`, failures.join("; "));
      }
    }, golden.maxLatencyMs + 2000);
  }

  it("prints summary table", () => {
    if (results.length === 0) return;

    const rows = results.map((r) => ({
      query: r.query.slice(0, 45).padEnd(45),
      intent: r.trace.intentType.padEnd(8),
      merged: String(r.trace.mergedCount).padStart(6),
      latency: `${Math.round(r.trace.latencyMs.total)}ms`.padStart(8),
      p50: r.trace.scoreP50 !== null ? r.trace.scoreP50.toFixed(3) : "n/a",
      status: r.passed ? "PASS" : "FAIL",
    }));

    const header = "Query                                         Intent   Merged Latency   P50   Status";
    const sep = "-".repeat(header.length);
    console.log("\n" + header);
    console.log(sep);
    for (const row of rows) {
      console.log(
        `${row.query} ${row.intent} ${row.merged} ${row.latency}  ${row.p50}  ${row.status}`,
      );
    }

    const passCount = results.filter((r) => r.passed).length;
    console.log(`\n${passCount}/${results.length} queries passed\n`);
  });
});

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (1 - (idx - lo)) + sorted[hi]! * (idx - lo);
}
