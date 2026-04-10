import { runSearchMode, type SearchExecutionOptions } from "@/services/search";
import type { RepoDoc, SearchMode } from "@/core/types";

export async function runSearchEval(
  query: string,
  mode: SearchMode = "hybrid+github-fallback",
  options: SearchExecutionOptions = {},
): Promise<RepoDoc[]> {
  const result = await runSearchMode(query, mode, {
    ...options,
    persistGithubResults: options.persistGithubResults ?? false,
  });

  return result.repos;
}
