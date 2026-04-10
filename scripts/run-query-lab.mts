import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type QueryLabRunItem = {
  id: string;
  query: string;
  queryType: string;
  topSlugs: string[];
  precisionAt5: number;
  precisionAt10: number;
  reciprocalRank: number;
  firstRelevantRank: number | null;
  ndcgAt10: number;
  badInTop5: number;
  relevantInTop5: number;
  relevantInTop10: number;
  error?: string;
};

function parseLimitArg() {
  const raw = process.argv.find((arg) => arg.startsWith("--limit="));
  const value = Number(raw?.split("=")[1] ?? "");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-");
}

function toMarkdown(
  runId: string,
  summary: {
    queryCount: number;
    avgPrecisionAt5: number;
    avgPrecisionAt10: number;
    avgMRR: number;
    avgNdcgAt10: number;
    avgBadInTop5: number;
    queriesWithoutRelevant: number;
  },
  items: QueryLabRunItem[],
) {
  const failures = items.filter((item) => item.error);
  const misses = items
    .filter((item) => !item.error && item.firstRelevantRank == null)
    .slice(0, 10);

  return [
    `# Query Lab Baseline`,
    ``,
    `- Run ID: \`${runId}\``,
    `- Queries: ${summary.queryCount}`,
    `- Avg P@5: ${summary.avgPrecisionAt5}`,
    `- Avg P@10: ${summary.avgPrecisionAt10}`,
    `- Avg MRR: ${summary.avgMRR}`,
    `- Avg nDCG@10: ${summary.avgNdcgAt10}`,
    `- Avg badInTop5: ${summary.avgBadInTop5}`,
    `- Queries without relevant result: ${summary.queriesWithoutRelevant}`,
    ``,
    `## Failures`,
    ...(failures.length
      ? failures.map((item) => `- \`${item.id}\` — ${item.error}`)
      : ["- None"]),
    ``,
    `## Misses`,
    ...(misses.length
      ? misses.map((item) => `- \`${item.id}\` — no relevant result in top 10 for "${item.query}"`)
      : ["- None"]),
  ].join("\n");
}

const queryFile = path.resolve("evals/query-lab/queries.jsonl");
const outDir = path.resolve("artifacts/evals/query-lab");
const runDir = path.join(outDir, "runs");
const limit = parseLimitArg();

async function main() {
  const QueryLab = await import("../src/services/eval/query-lab.ts");
  const SearchEval = await import("../src/services/eval/search-eval.ts");

  await mkdir(runDir, { recursive: true });

  const queries = await QueryLab.loadEvalQueries(queryFile);
  const selected = limit ? queries.slice(0, limit) : queries;
  const runId = timestamp();
  const items: QueryLabRunItem[] = [];

  for (const query of selected) {
    try {
      const repos = await SearchEval.runSearchEval(query.query);
      const score = QueryLab.scoreEvalQuery(
        query,
        repos.map((repo) => repo.slug),
      );

      items.push({
        id: query.id,
        query: query.query,
        queryType: query.query_type,
        topSlugs: score.topSlugs.slice(0, 10),
        precisionAt5: score.precisionAt5,
        precisionAt10: score.precisionAt10,
        reciprocalRank: score.reciprocalRank,
        firstRelevantRank: score.firstRelevantRank,
        ndcgAt10: score.ndcgAt10,
        badInTop5: score.badInTop5,
        relevantInTop5: score.relevantInTop5,
        relevantInTop10: score.relevantInTop10,
      });
    } catch (error) {
      items.push({
        id: query.id,
        query: query.query,
        queryType: query.query_type,
        topSlugs: [],
        precisionAt5: 0,
        precisionAt10: 0,
        reciprocalRank: 0,
        firstRelevantRank: null,
        ndcgAt10: 0,
        badInTop5: 0,
        relevantInTop5: 0,
        relevantInTop10: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = QueryLab.summarizeQueryLab(
    items.map((item) => ({
      queryId: item.id,
      query: item.query,
      topSlugs: item.topSlugs,
      precisionAt5: item.precisionAt5,
      precisionAt10: item.precisionAt10,
      reciprocalRank: item.reciprocalRank,
      firstRelevantRank: item.firstRelevantRank,
      ndcgAt10: item.ndcgAt10,
      badInTop5: item.badInTop5,
      relevantInTop5: item.relevantInTop5,
      relevantInTop10: item.relevantInTop10,
    })),
  );

  const result = {
    runId,
    generatedAt: new Date().toISOString(),
    queryFile,
    queryCount: selected.length,
    summary,
    items,
  };

  const json = JSON.stringify(result, null, 2);
  const markdown = toMarkdown(runId, summary, items);

  await writeFile(path.join(runDir, `${runId}.json`), json);
  await writeFile(path.join(outDir, "latest-summary.json"), json);
  await writeFile(path.join(outDir, "latest-summary.md"), markdown);

  console.log(markdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
