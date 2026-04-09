import { db, repos } from "@/db";
import { searchMulti, fetchReadme } from "@/lib/github";
import { parseQuery, generateCombos } from "@/lib/openai";
import { searchVectors, upsertVectors } from "@/lib/qdrant";
import { rerank } from "@/services/reranker";
import { logger } from "@/lib/logger";
import { sql, getTableColumns } from "drizzle-orm";
import type { RepoDoc, ParsedQuery, QueryType } from "@/core/types";

export async function search(
  queryText: string,
  comboLimit = 3,
): Promise<{ parsed: ParsedQuery; repos: RepoDoc[]; combos: unknown[] }> {
  const parsed = await parseQuery(queryText);
  logger.info({ parsed }, "Query parsed");

  const enrichedVectorQuery = [
    ...parsed.anchorTerms,
    ...parsed.capabilityTerms,
  ].join(" ") || queryText;

  const intentNeedsGithub =
    parsed.intentType === "explore" || parsed.intentType === "build";

  const [ftsResult, vectorResult] = await Promise.allSettled([
    lexicalSearch(parsed, 12),
    searchVectors(enrichedVectorQuery, parsed, 12),
  ]);

  const ftsRepos: RepoDoc[] =
    ftsResult.status === "fulfilled" ? ftsResult.value : [];
  const vectorRepos: RepoDoc[] =
    vectorResult.status === "fulfilled" ? vectorResult.value : [];

  if (ftsResult.status === "rejected")
    logger.warn({ err: ftsResult.reason }, "FTS search failed");
  if (vectorResult.status === "rejected")
    logger.warn({ err: vectorResult.reason }, "Vector search failed");

  const needsGithub =
    intentNeedsGithub ||
    ftsRepos.length < 4 ||
    avgScore(ftsRepos) < 0.5;

  let githubRepos: RepoDoc[] = [];
  if (needsGithub && parsed.githubQueries.length > 0) {
    githubRepos = await searchFromGithub(parsed.githubQueries, 15);
    githubRepos = rescoreGithubRepos(githubRepos, parsed);
  }

  const weights = computeAdaptiveWeights(
    parsed,
    ftsRepos.length,
    avgScore(ftsRepos),
  );

  const allRepos = weightedRRF(
    [
      { repos: ftsRepos, weight: weights.fts },
      { repos: vectorRepos, weight: weights.vector },
      { repos: githubRepos, weight: weights.github },
    ],
    { k: 20 },
  ).slice(0, 30);

  let reranked: RepoDoc[];
  try {
    reranked = await rerank(queryText, allRepos, 15);
  } catch (e) {
    logger.warn({ err: e }, "Re-ranking failed, using RRF order");
    reranked = allRepos.slice(0, 15);
  }

  logger.info(
    { fts: ftsRepos.length, vector: vectorRepos.length, github: githubRepos.length, merged: allRepos.length, reranked: reranked.length },
    "Search pipeline complete",
  );

  const combos = reranked.length >= 2
    ? await generateCombos(reranked, queryText, comboLimit)
    : [];

  return { parsed, repos: reranked, combos };
}

/* ------------------------------------------------------------------ */
/*  Full-Text Search using PostgreSQL tsvector + ts_rank               */
/*  Falls back to ILIKE if query produces no tsquery tokens.           */
/* ------------------------------------------------------------------ */
async function lexicalSearch(
  parsed: ParsedQuery,
  limit: number,
): Promise<RepoDoc[]> {
  const terms = [...parsed.anchorTerms, ...parsed.capabilityTerms];
  if (!terms.length) return [];

  const rawQuery = terms.join(" ");

  const { fts: _fts, ...selectColumns } = getTableColumns(repos);

  const rows = await db
    .select({
      ...selectColumns,
      rank: sql<number>`ts_rank_cd(${repos.fts}, plainto_tsquery('english', ${rawQuery}))`,
    })
    .from(repos)
    .where(sql`${repos.fts} @@ plainto_tsquery('english', ${rawQuery})`)
    .orderBy(sql`ts_rank_cd(${repos.fts}, plainto_tsquery('english', ${rawQuery})) DESC`)
    .limit(limit);

  if (rows.length > 0) {
    return rows.map((r) => toRepoDoc(r, r.rank, "fts"));
  }

  logger.info({ terms }, "FTS returned 0 results, falling back to ILIKE");
  return ilikeFallback(terms, limit);
}

async function ilikeFallback(
  terms: string[],
  limit: number,
): Promise<RepoDoc[]> {
  const { fts: _fts, ...selectColumns } = getTableColumns(repos);

  const conditions = terms.map((t) => {
    const escaped = t.replace(/[%_]/g, "\\$&");
    return sql`(${repos.slug} ILIKE ${`%${escaped}%`} OR ${repos.description} ILIKE ${`%${escaped}%`})`;
  });

  const rows = await db
    .select(selectColumns)
    .from(repos)
    .where(sql`${sql.join(conditions, sql` OR `)}`)
    .limit(limit * 2);

  return rows
    .map((r) => {
      const matchCount = terms.filter(
        (t) =>
          r.slug.toLowerCase().includes(t.toLowerCase()) ||
          (r.description ?? "").toLowerCase().includes(t.toLowerCase()),
      ).length;
      const score = 0.3 + (0.7 * matchCount) / terms.length;
      return toRepoDoc(r, score, "lexical");
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}

function toRepoDoc(
  r: Omit<typeof repos.$inferSelect, "fts">,
  score: number,
  source: string,
): RepoDoc {
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
    source,
  };
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

// ── GitHub Re-Scoring ───────────────────────────────────────────────────────
//
// Compute text relevance score for GitHub results before feeding into RRF.
// RRF assumes rank=1 means "most relevant", but GitHub returns by stars.
// This re-scores so ranks reflect textual relevance, not popularity.

function rescoreGithubRepos(
  repos: RepoDoc[],
  parsed: ParsedQuery,
): RepoDoc[] {
  const queryTerms = [
    ...parsed.anchorTerms,
    ...parsed.capabilityTerms,
  ].map((t) => t.toLowerCase());

  const anchorLower = parsed.anchorTerms.map((t) => t.toLowerCase());
  const requiredLower = parsed.requiredEntities.map((e) => e.toLowerCase());

  if (queryTerms.length === 0) return repos;

  const scored = repos.map((repo) => {
    const slugLower = repo.slug.toLowerCase();
    const nameLower = repo.name.toLowerCase();
    const descLower = (repo.description ?? "").toLowerCase();
    const topicsLower = (repo.topics ?? []).join(" ").toLowerCase();

    const docTerms = new Set(
      `${slugLower} ${nameLower} ${descLower} ${topicsLower}`
        .split(/\s+/)
        .filter(Boolean),
    );

    let matchCount = 0;
    let slugBonus = 0;
    let anchorBonus = 0;

    for (const term of queryTerms) {
      const inDoc =
        slugLower.includes(term) ||
        nameLower.includes(term) ||
        descLower.includes(term) ||
        topicsLower.includes(term);
      if (inDoc) matchCount++;

      if (slugLower.includes(term) || nameLower.includes(term)) {
        slugBonus++;
      }
    }

    for (const anchor of anchorLower) {
      if (slugLower.includes(anchor) || nameLower.includes(anchor)) {
        anchorBonus++;
      }
    }

    let requiredBonus = 0;
    for (const req of requiredLower) {
      if (slugLower.includes(req) || nameLower.includes(req) || descLower.includes(req)) {
        requiredBonus++;
      }
    }

    const jaccard = matchCount / (queryTerms.length + docTerms.size - matchCount || 1);
    const baseScore = 0.2 + 0.5 * jaccard;
    const slugWeight = Math.min(slugBonus / queryTerms.length, 1) * 0.15;
    const anchorWeight = Math.min(anchorBonus / Math.max(anchorLower.length, 1), 1) * 0.1;
    const requiredWeight = requiredBonus > 0 ? 0.05 * requiredBonus : 0;

    const score = Math.min(baseScore + slugWeight + anchorWeight + requiredWeight, 1.0);

    return { ...repo, score };
  });

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return scored;
}

// ── Adaptive RRF Weights ────────────────────────────────────────────────────

function computeAdaptiveWeights(
  parsed: ParsedQuery,
  ftsCount: number,
  ftsAvgScore: number,
): { fts: number; vector: number; github: number } {
  const w = { fts: 1.4, vector: 1.2, github: 1.0 };

  const qt: QueryType = parsed.queryType ?? "capability_search";

  if (parsed.intentType === "lookup" || qt === "specific_tool") {
    w.fts *= 1.3;
    w.vector *= 0.7;
  }
  if (parsed.intentType === "explore" || qt === "capability_search") {
    w.vector *= 1.3;
    w.github *= 1.2;
  }
  if (parsed.intentType === "build") {
    w.vector *= 1.2;
    w.github *= 1.2;
  }
  if (qt === "alternative") {
    w.vector *= 1.4;
    w.github *= 1.2;
  }
  if (qt === "comparison") {
    w.fts *= 1.2;
    w.vector *= 1.2;
  }

  if (ftsCount < 3) {
    w.vector *= 1.2;
    w.github *= 1.2;
  }
  if (ftsAvgScore > 0.7) {
    w.fts *= 1.15;
  }

  return w;
}

// ── Weighted Reciprocal Rank Fusion ─────────────────────────────────────────

interface RankedSource {
  repos: RepoDoc[];
  weight: number;
}

export function weightedRRF(
  sources: RankedSource[],
  { k = 20 }: { k?: number } = {},
): RepoDoc[] {
  const scores = new Map<string, { score: number; doc: RepoDoc }>();

  for (const { repos, weight } of sources) {
    for (let rank = 0; rank < repos.length; rank++) {
      const r = repos[rank];
      const contribution = weight / (k + rank + 1);
      const existing = scores.get(r.slug);
      if (existing) {
        existing.score += contribution;
        if (!existing.doc.readme && r.readme) existing.doc.readme = r.readme;
        if (!existing.doc.capabilities.length && r.capabilities.length)
          existing.doc.capabilities = r.capabilities;
        if (!existing.doc.primitives.length && r.primitives.length)
          existing.doc.primitives = r.primitives;
      } else {
        scores.set(r.slug, { score: contribution, doc: { ...r } });
      }
    }
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ score, doc }) => ({ ...doc, score }));
}

function avgScore(list: RepoDoc[]): number {
  if (!list.length) return 0;
  return list.reduce((s, r) => s + (r.score ?? 0), 0) / list.length;
}
