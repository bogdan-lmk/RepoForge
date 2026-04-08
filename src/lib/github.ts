import { Octokit } from "octokit";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import type { RepoDoc } from "@/core/types";

const octokit = env.GITHUB_TOKEN ? new Octokit({ auth: env.GITHUB_TOKEN }) : new Octokit();

export async function searchRepos(
  query: string,
  perPage = 10,
): Promise<RepoDoc[]> {
  const { data } = await octokit.rest.search.repos({
    q: `${query} archived:false`,
    per_page: perPage,
    sort: "stars",
    order: "desc",
  });

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

  for (const q of queries) {
    if (seen.size >= maxTotal) break;
    try {
      const docs = await searchRepos(q, 10);
      for (const doc of docs) {
        if (!seen.has(doc.slug) && seen.size < maxTotal) {
          seen.add(doc.slug);
          results.push(doc);
        }
      }
    } catch (e) {
      logger.warn({ query: q, err: e }, "GitHub search query failed");
    }
  }

  return results;
}
