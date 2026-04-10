import { runSearchMode, type SearchExecutionOptions } from "@/services/search";
import type { RepoDoc, SearchMode } from "@/core/types";

export type SearchEvalOptions = SearchExecutionOptions & {
  mode?: SearchMode;
};

export async function runSearchEval(
  query: string,
  modeOrOptions: SearchMode | SearchEvalOptions = "hybrid+rerank",
  options: SearchExecutionOptions = {},
): Promise<RepoDoc[]> {
  const normalizedMode =
    typeof modeOrOptions === "string"
      ? modeOrOptions
      : (modeOrOptions.mode ?? "hybrid+rerank");
  const normalizedOptions =
    typeof modeOrOptions === "string"
      ? options
      : modeOrOptions;

  const result = await runSearchMode(query, normalizedMode, normalizedOptions);

  return result.repos;
}
