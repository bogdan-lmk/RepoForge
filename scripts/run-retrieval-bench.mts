import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SearchMode } from "../src/core/types.ts";

const defaultModes: SearchMode[] = ["fts-only", "vector-only", "hybrid", "hybrid+rerank"];

function parseArg(name: string) {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw?.split("=")[1] ?? null;
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-");
}

function parseModes() {
  const raw = parseArg("modes");
  return raw
    ? raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean) as SearchMode[]
    : defaultModes;
}

function parseLimitArg() {
  const raw = parseArg("limit");
  const value = Number(raw ?? "");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function toMarkdown(result: {
  runId: string;
  baselineMode: string;
  runs: Array<{
    mode: string;
    medianLatencyMs: number;
    metrics: {
      avgPrecisionAt5: number;
      avgMRR: number;
      avgNdcgAt10: number;
      queriesWithoutRelevant: number;
    };
  }>;
  comparisons: Array<{
    candidate: string;
    decision: string;
    mrrDeltaPct: number;
    ndcgDeltaPct: number;
    latencyDeltaPct: number;
    improvedQueries: number;
    degradedQueries: number;
    notes: string[];
  }>;
}) {
  return [
    "# Retrieval Bench",
    "",
    `- Run ID: \`${result.runId}\``,
    `- Baseline: \`${result.baselineMode}\``,
    "",
    "## Modes",
    ...result.runs.map((run) =>
      `- \`${run.mode}\` — P@5 ${run.metrics.avgPrecisionAt5}, MRR ${run.metrics.avgMRR}, nDCG@10 ${run.metrics.avgNdcgAt10}, median latency ${run.medianLatencyMs}ms, misses ${run.metrics.queriesWithoutRelevant}`,
    ),
    "",
    "## Comparisons",
    ...result.comparisons.map((comparison) =>
      `- \`${comparison.candidate}\` — decision: ${comparison.decision}; MRR Δ ${comparison.mrrDeltaPct}%, nDCG Δ ${comparison.ndcgDeltaPct}%, latency Δ ${comparison.latencyDeltaPct}%, improved ${comparison.improvedQueries}, degraded ${comparison.degradedQueries}; ${comparison.notes.join(" ")}`,
    ),
  ].join("\n");
}

async function main() {
  const modes = parseModes();
  const limit = parseLimitArg();
  const queryFile = path.resolve("evals/query-lab/queries.jsonl");
  const outDir = path.resolve("artifacts/evals/retrieval-bench");
  const runDir = path.join(outDir, "runs");

  const QueryLab = await import("../src/services/eval/query-lab.ts");
  const SearchEval = await import("../src/services/eval/search-eval.ts");
  const Bench = await import("../src/services/eval/retrieval-bench.ts");

  await mkdir(runDir, { recursive: true });

  const allQueries = await QueryLab.loadEvalQueries(queryFile);
  const queries = limit ? allQueries.slice(0, limit) : allQueries;
  const runId = timestamp();

  const runs = [];
  for (const mode of modes) {
    const scores = [];
    const latenciesMs = [];

    for (const query of queries) {
      const startedAt = performance.now();
      const repos = await SearchEval.runSearchEval(query.query, mode);
      latenciesMs.push(Number((performance.now() - startedAt).toFixed(2)));
      scores.push(Bench.createBenchScore(query, repos.map((repo) => repo.slug)));
    }

    runs.push(Bench.summarizeBenchRun(mode, scores, latenciesMs));
  }

  const baseline = runs[0];
  const comparisons = runs.slice(1).map((candidate) => Bench.compareBenchRuns(baseline, candidate));
  const result = {
    runId,
    generatedAt: new Date().toISOString(),
    baselineMode: baseline.mode,
    runs,
    comparisons,
  };

  const json = JSON.stringify(result, null, 2);
  const markdown = toMarkdown(result);

  await writeFile(path.join(runDir, `${runId}.json`), json);
  await writeFile(path.join(outDir, "latest-summary.json"), json);
  await writeFile(path.join(outDir, "latest-summary.md"), markdown);

  console.log(markdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
