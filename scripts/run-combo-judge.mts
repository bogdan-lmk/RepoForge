import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArg(name: string) {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return raw?.split("=")[1] ?? null;
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-");
}

function parseLimitArg() {
  const raw = parseArg("limit");
  const value = Number(raw ?? "");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function toMarkdown(result: {
  runId: string;
  baseline: string;
  candidate: string;
  summary: {
    queryCount: number;
    pairwiseWinRate: number;
    baselineAverage: Record<string, number>;
    candidateAverage: Record<string, number>;
    decision: string;
    notes: string[];
  };
}) {
  return [
    "# Combo Judge",
    "",
    `- Run ID: \`${result.runId}\``,
    `- Baseline: \`${result.baseline}\``,
    `- Candidate: \`${result.candidate}\``,
    `- Queries: ${result.summary.queryCount}`,
    `- Pairwise win rate: ${result.summary.pairwiseWinRate}`,
    `- Decision: ${result.summary.decision}`,
    "",
    "## Baseline Averages",
    ...Object.entries(result.summary.baselineAverage).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Candidate Averages",
    ...Object.entries(result.summary.candidateAverage).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Notes",
    ...result.summary.notes.map((note) => `- ${note}`),
  ].join("\n");
}

async function main() {
  const baseline = parseArg("baseline") ?? "baseline";
  const candidate = parseArg("candidate") ?? "variant-a";
  const limit = parseLimitArg();

  const ComboEval = await import("../src/services/eval/combo-eval.ts");
  const Search = await import("../src/services/search.ts");

  const queryFile = path.resolve("evals/combo-judge/queries.jsonl");
  const promptDir = path.resolve("evals/combo-judge/prompt-variants");
  const outDir = path.resolve("artifacts/evals/combo-judge");
  const rawDir = path.join(outDir, "raw", timestamp());

  await mkdir(rawDir, { recursive: true });

  const baselinePrompt = await ComboEval.loadPromptVariant(path.join(promptDir, `${baseline}.txt`));
  const candidatePrompt = await ComboEval.loadPromptVariant(path.join(promptDir, `${candidate}.txt`));
  const allQueries = await ComboEval.loadComboJudgeQueries(queryFile);
  const queries = limit ? allQueries.slice(0, limit) : allQueries;
  const runId = path.basename(rawDir);

  const items = [];
  for (const query of queries) {
    const searchResult = await Search.runSearchMode(query.query, "hybrid+rerank", {
      rerankLimit: 10,
    });
    const repos = searchResult.repos.slice(0, 8);

    const baselineOutput = await ComboEval.generateVariantCombos(query.query, repos, baselinePrompt);
    const candidateOutput = await ComboEval.generateVariantCombos(query.query, repos, candidatePrompt);
    const judgment = await ComboEval.judgeComboVariants({
      query: query.query,
      notes: query.notes,
      repos,
      baselineOutput,
      candidateOutput,
    });

    const raw = {
      query,
      repos,
      baselineOutput,
      candidateOutput,
      judgment,
    };
    await writeFile(path.join(rawDir, `${query.id}.json`), JSON.stringify(raw, null, 2));

    items.push({
      queryId: query.id,
      query: query.query,
      verdict: judgment.verdict,
      baseline: judgment.baseline,
      candidate: judgment.candidate,
      rationale: judgment.rationale,
    });
  }

  const summary = ComboEval.summarizeComboJudge(items);
  const result = {
    runId,
    generatedAt: new Date().toISOString(),
    baseline,
    candidate,
    summary,
    items,
  };

  const json = JSON.stringify(result, null, 2);
  const markdown = toMarkdown(result);

  await writeFile(path.join(outDir, "latest-summary.json"), json);
  await writeFile(path.join(outDir, "latest-summary.md"), markdown);
  await writeFile(path.join(rawDir, "summary.json"), json);

  console.log(markdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
