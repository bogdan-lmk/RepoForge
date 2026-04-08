import { logger } from "@/lib/logger";
import { env } from "@/env";

const BASE_URL = "https://libraries.io/api";

export interface SourceRankResult {
  ecosystem: string;
  packageName: string;
  sourceRank: number;
  dependentReposCount: number;
  dependentPackagesCount: number;
}

export async function fetchSourceRank(
  repoSlug: string,
): Promise<SourceRankResult | null> {
  const apiKey = env.LIBRARIES_IO_API_KEY;
  if (!apiKey) return null;

  try {
    const project = await findProject(repoSlug, apiKey);
    if (!project) return null;

    const platform = String(project.platform ?? "").trim();
    const name = String(project.name ?? "").trim();
    if (!platform || !name) return null;

    const [details, breakdown] = await Promise.all([
      getJson(`/${platform}/${name}`, apiKey),
      getJson(`/${platform}/${name}/sourcerank`, apiKey),
    ]);

    const sourceRank = computeSourceRank(breakdown);

    return {
      ecosystem: platform,
      packageName: name,
      sourceRank,
      dependentReposCount: toInt((details as Record<string, unknown>)?.dependent_repos_count),
      dependentPackagesCount: toInt((details as Record<string, unknown>)?.dependents_count),
    };
  } catch (e) {
    logger.warn({ err: e, slug: repoSlug }, "Libraries.io fetch failed");
    return null;
  }
}

async function findProject(
  repoSlug: string,
  apiKey: string,
): Promise<Record<string, unknown> | null> {
  const repoUrl = `https://github.com/${repoSlug}`;

  const bySlug = await searchProjects(repoSlug, apiKey);
  const match = bySlug.find(
    (c) =>
      String(c.repository_url ?? "").replace(/\/$/, "").toLowerCase() ===
      repoUrl.toLowerCase(),
  );
  if (match) return match;

  const repoName = repoSlug.split("/").pop() ?? "";
  if (repoName && repoName !== repoSlug) {
    const byName = await searchProjects(repoName, apiKey);
    const nameMatch = byName.find(
      (c) =>
        String(c.repository_url ?? "").replace(/\/$/, "").toLowerCase() ===
        repoUrl.toLowerCase(),
    );
    if (nameMatch) return nameMatch;
  }

  return null;
}

async function searchProjects(
  query: string,
  apiKey: string,
): Promise<Record<string, unknown>[]> {
  const payload = await getJson("/search", apiKey, { q: query });
  if (!Array.isArray(payload)) return [];
  return payload.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
}

async function getJson(
  path: string,
  apiKey: string,
  params?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Libraries.io ${res.status}`);
  return res.json();
}

function computeSourceRank(payload: unknown): number {
  if (!payload || typeof payload !== "object") return 0;
  return Object.values(payload as Record<string, unknown>).reduce<number>(
    (sum, v) => sum + toInt(v),
    0,
  );
}

function toInt(v: unknown): number {
  if (v == null || v === "") return 0;
  return Number(v) | 0;
}
