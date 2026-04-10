import { Octokit } from "@octokit/rest";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import type { RepoDoc } from "@/core/types";

const octokit = env.GITHUB_TOKEN ? new Octokit({ auth: env.GITHUB_TOKEN }) : new Octokit();

export type GithubSortMode = "stars" | "best-match";

export async function searchRepos(
  query: string,
  perPage = 10,
  sortMode: GithubSortMode = "stars",
): Promise<RepoDoc[]> {
  const params: Record<string, unknown> = {
    q: `${query} archived:false`,
    per_page: perPage,
  };

  if (sortMode === "stars") {
    params.sort = "stars";
    params.order = "desc";
  }

  const { data } = await octokit.rest.search.repos(params as Parameters<typeof octokit.rest.search.repos>[0]);

  return data.items.map((r) => ({
    slug: r.full_name,
    name: r.name,
    url: r.html_url,
    description: r.description ?? "",
    readme: "",
    language: r.language ?? null,
    topics: r.topics ?? [],
    stars: r.stargazers_count ?? 0,
    capabilities: [],
    primitives: [],
  }));
}

export async function searchDual(
  query: string,
  perStrategy = 10,
): Promise<RepoDoc[]> {
  const [bestMatch, byStars] = await Promise.allSettled([
    searchRepos(query, perStrategy, "best-match"),
    searchRepos(query, perStrategy, "stars"),
  ]);

  const bestMatchRepos = bestMatch.status === "fulfilled" ? bestMatch.value : [];
  const starsRepos = byStars.status === "fulfilled" ? byStars.value : [];

  if (bestMatch.status === "rejected") {
    logger.warn({ err: bestMatch.reason, query }, "GitHub best-match search failed");
  }
  if (byStars.status === "rejected") {
    logger.warn({ err: byStars.reason, query }, "GitHub stars search failed");
  }

  const seen = new Set<string>();
  const results: RepoDoc[] = [];

  for (const repo of bestMatchRepos) {
    if (!seen.has(repo.slug)) {
      seen.add(repo.slug);
      results.push(repo);
    }
  }

  for (const repo of starsRepos) {
    if (!seen.has(repo.slug)) {
      seen.add(repo.slug);
      results.push(repo);
    }
  }

  return results;
}

export async function fetchReadme(
  owner: string,
  repo: string,
): Promise<string> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: "README.md",
    });
    if ("content" in data && typeof data.content === "string") {
      return Buffer.from(data.content, "base64").toString("utf-8").slice(0, 8000);
    }
    return "";
  } catch {
    logger.warn({ owner, repo }, "Failed to fetch README");
    return "";
  }
}

export async function fetchRepoDetails(
  slug: string,
): Promise<RepoDoc | null> {
  const [owner, repo] = slug.split("/");
  if (!owner || !repo) return null;

  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    const readme = await fetchReadme(owner, repo);
    return {
      slug: data.full_name,
      name: data.name,
      url: data.html_url,
      description: data.description ?? "",
      readme,
      language: data.language ?? null,
      topics: (data as { topics?: string[] }).topics ?? [],
      stars: data.stargazers_count ?? 0,
      capabilities: [],
      primitives: [],
    };
  } catch {
    logger.warn({ slug }, "Failed to fetch repo details");
    return null;
  }
}

export async function searchMulti(
  queries: string[],
  maxTotal = 15,
): Promise<RepoDoc[]> {
  const seen = new Set<string>();
  const results: RepoDoc[] = [];

  for (let i = 0; i < queries.length; i++) {
    if (seen.size >= maxTotal) break;
    try {
      const docs = i === 0
        ? await searchDual(queries[i], 10)
        : await searchRepos(queries[i], 10);

      for (const doc of docs) {
        if (!seen.has(doc.slug) && seen.size < maxTotal) {
          seen.add(doc.slug);
          results.push(doc);
        }
      }
    } catch (e) {
      logger.warn({ query: queries[i], err: e }, "GitHub search query failed");
    }
  }

  return results;
}
