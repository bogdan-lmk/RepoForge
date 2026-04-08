import { db, repos } from "@/db";
import { searchMulti, fetchReadme } from "@/lib/github";
import { parseQuery, generateCombos } from "@/lib/openai";
import { searchVectors, upsertVectors } from "@/lib/qdrant";
import { logger } from "@/lib/logger";
import { or, sql } from "drizzle-orm";
import type { RepoDoc, ParsedQuery } from "@/core/types";

export async function search(
  queryText: string,
  comboLimit = 3,
): Promise<{ parsed: ParsedQuery; repos: RepoDoc[]; combos: unknown[] }> {
  const parsed = await parseQuery(queryText);
  logger.info({ parsed }, "Query parsed");

  const localRepos = await lexicalSearch(parsed, 12);
  const needsGithub =
    parsed.intentType === "explore" ||
    parsed.intentType === "build" ||
    localRepos.length < 4 ||
    avgScore(localRepos) < 0.5;

  let allRepos = localRepos;
  if (needsGithub && parsed.githubQueries.length > 0) {
    const githubRepos = await searchFromGithub(parsed.githubQueries, 15);
    allRepos = mergeRepos(localRepos, githubRepos);
  }

  let vectorRepos: RepoDoc[] = [];
  try {
    vectorRepos = await searchVectors(queryText, 8);
    allRepos = mergeRepos(allRepos, vectorRepos);
  } catch (e) {
    logger.warn({ err: e }, "Vector search failed");
  }

  allRepos.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  allRepos = allRepos.slice(0, 15);

  const combos = allRepos.length >= 2
    ? await generateCombos(allRepos, queryText, comboLimit)
    : [];

  return { parsed, repos: allRepos, combos };
}

async function lexicalSearch(
  parsed: ParsedQuery,
  limit: number,
): Promise<RepoDoc[]> {
  const terms = [...parsed.anchorTerms, ...parsed.capabilityTerms];
  if (!terms.length) return [];

  const conditions = terms.map((t) => {
    const escaped = t.replace(/[%_]/g, "\\$&");
    return or(
      sql`${repos.slug} ILIKE ${`%${escaped}%`}`,
      sql`${repos.description} ILIKE ${`%${escaped}%`}`,
    );
  });

  const rows = await db
    .select()
    .from(repos)
    .where(or(...conditions))
    .limit(limit * 2);

  return rows
    .map((r) => {
      const matchCount = terms.filter(
        (t) =>
          r.slug.toLowerCase().includes(t.toLowerCase()) ||
          (r.description ?? "").toLowerCase().includes(t.toLowerCase()),
      ).length;
      const score = 0.3 + (0.7 * matchCount) / terms.length;
      return {
        slug: r.slug,
        name: r.name,
        url: r.url,
        description: r.description ?? "",
        readme: r.readme ?? "",
        language: r.language,
        topics: (r.topics as string[]) ?? [],
        stars: r.stars ?? 0,
        capabilities: (r.capabilities as string[]) ?? [],
        primitives: (r.primitives as string[]) ?? [],
        score,
        source: "lexical",
      } satisfies RepoDoc;
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}

async function searchFromGithub(
  queries: string[],
  maxTotal: number,
): Promise<RepoDoc[]> {
  const docs = await searchMulti(queries, maxTotal);
  if (!docs.length) return [];

  const enriched = await Promise.all(
    docs.slice(0, 5).map(async (d) => {
      const [owner, repo] = d.slug.split("/");
      if (owner && repo) {
        d.readme = await fetchReadme(owner, repo);
      }
      return d;
    }),
  );

  await persistRepos(enriched);
  try {
    await upsertVectors(enriched);
  } catch (e) {
    logger.warn({ err: e }, "Vector upsert failed after GitHub search");
  }

  return enriched.map((d) => ({ ...d, source: "github" }));
}

async function persistRepos(repoDocs: RepoDoc[]): Promise<void> {
  for (const doc of repoDocs) {
    await db
      .insert(repos)
      .values({
        slug: doc.slug,
        name: doc.name,
        url: doc.url,
        description: doc.description,
        readme: doc.readme,
        language: doc.language,
        topics: doc.topics,
        stars: doc.stars,
        capabilities: doc.capabilities,
        primitives: doc.primitives,
      })
      .onConflictDoUpdate({
        target: repos.slug,
        set: {
          name: doc.name,
          url: doc.url,
          description: doc.description ?? undefined,
          readme: doc.readme || undefined,
          language: doc.language ?? undefined,
          topics: doc.topics?.length ? doc.topics : undefined,
          stars: doc.stars ?? undefined,
          capabilities: doc.capabilities?.length ? doc.capabilities : undefined,
          primitives: doc.primitives?.length ? doc.primitives : undefined,
          updatedAt: new Date(),
        },
      });
  }
}

function mergeRepos(local: RepoDoc[], incoming: RepoDoc[]): RepoDoc[] {
  const map = new Map<string, RepoDoc>();
  for (const r of local) map.set(r.slug, r);
  for (const r of incoming) {
    const existing = map.get(r.slug);
    if (existing) {
      existing.score = Math.max(existing.score ?? 0, r.score ?? 0);
      if (!existing.readme && r.readme) existing.readme = r.readme;
      if (!existing.capabilities.length && r.capabilities.length)
        existing.capabilities = r.capabilities;
    } else {
      map.set(r.slug, r);
    }
  }
  return [...map.values()];
}

function avgScore(repos: RepoDoc[]): number {
  if (!repos.length) return 0;
  return repos.reduce((s, r) => s + (r.score ?? 0), 0) / repos.length;
}
