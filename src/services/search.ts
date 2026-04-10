import { db, repos } from "@/db";
import { searchMulti, fetchReadme } from "@/lib/github";
import { parseQuery, generateCombos } from "@/lib/openai";
import { searchVectors, upsertVectors } from "@/lib/qdrant";
import { rerank } from "@/services/reranker";
import { persistTrace } from "@/services/tracing";
import { logger } from "@/lib/logger";
import { sql, getTableColumns } from "drizzle-orm";
import type { RepoDoc, ParsedQuery, QueryType, SearchMode } from "@/core/types";

type SearchOptions = {
  comboLimit?: number;
  generateCombos?: boolean;
};

export type SearchExecutionOptions = {
  limit?: number;
  rerankLimit?: number;
  disableGithubFallback?: boolean;
  persistGithubResults?: boolean;
};

export type SearchRunResult = {
  parsed: ParsedQuery;
  repos: RepoDoc[];
  ftsRepos: RepoDoc[];
  vectorRepos: RepoDoc[];
  githubRepos: RepoDoc[];
  mode: SearchMode;
};

export async function search(
  queryText: string,
  options: number | SearchOptions = 3,
): Promise<{ parsed: ParsedQuery; repos: RepoDoc[]; combos: unknown[] }> {
  const comboLimit =
    typeof options === "number" ? options : (options.comboLimit ?? 3);
  const shouldGenerateCombos =
    typeof options === "number" ? true : (options.generateCombos ?? true);

  const result = await runSearchMode(queryText, "hybrid+github-fallback");

  const combos = shouldGenerateCombos && result.repos.length >= 2
    ? await generateCombos(result.repos, queryText, comboLimit)
    : [];

  return { parsed: result.parsed, repos: result.repos, combos };
}

export async function runSearchMode(
  queryText: string,
  mode: SearchMode,
  options: SearchExecutionOptions = {},
): Promise<SearchRunResult> {
  const parsed = await parseQuery(queryText);
  logger.info({ parsed, mode }, "Query parsed");

  const limit = options.limit ?? 12;
  const rerankLimit = options.rerankLimit ?? 15;
  const persistGithubResults = options.persistGithubResults ?? true;
  const enrichedVectorQuery = [
    ...parsed.anchorTerms,
    ...parsed.capabilityTerms,
  ].join(" ") || queryText;

  const t0 = performance.now();
  let latencyFtsMs = 0;
  let latencyVectorMs = 0;

  const [ftsResult, vectorResult] = await Promise.allSettled([
    (async () => { const t = performance.now(); const r = await lexicalSearch(parsed, limit); latencyFtsMs = performance.now() - t; return r; })(),
    (async () => { const t = performance.now(); const r = await searchVectors(enrichedVectorQuery, parsed, limit); latencyVectorMs = performance.now() - t; return r; })(),
  ]);

  const ftsRepos = ftsResult.status === "fulfilled" ? ftsResult.value : [];
  const vectorRepos = vectorResult.status === "fulfilled" ? vectorResult.value : [];

  if (ftsResult.status === "rejected") {
    logger.warn({ err: ftsResult.reason, mode }, "FTS search failed");
  }
  if (vectorResult.status === "rejected") {
    logger.warn({ err: vectorResult.reason, mode }, "Vector search failed");
  }

  const needsGithub = shouldUseGithubFallback(parsed, ftsRepos, vectorRepos, options);
  let latencyGithubMs: number | null = null;
  const githubRepos = mode === "hybrid+github-fallback" && needsGithub && parsed.githubQueries.length > 0
    ? await (async () => {
        const tGh = performance.now();
        const raw = await searchFromGithub(parsed.githubQueries, rerankLimit, {
          persistResults: persistGithubResults,
        });
        latencyGithubMs = performance.now() - tGh;
        return rescoreGithubRepos(raw, parsed);
      })()
    : [];

  const repos = await executeMode(queryText, parsed, mode, {
    ftsRepos,
    vectorRepos,
    githubRepos,
    limit,
    rerankLimit,
  });

  const latencyTotalMs = performance.now() - t0;

  logger.info(
    {
      mode,
      fts: ftsRepos.length,
      vector: vectorRepos.length,
      github: githubRepos.length,
      returned: repos.length,
    },
    "Search mode complete",
  );

  void persistTrace({
    queryText,
    parsed,
    ftsCount: ftsRepos.length,
    vectorCount: vectorRepos.length,
    githubCount: githubRepos.length,
    githubTriggered: needsGithub,
    mergedCount: repos.length,
    rerankedCount: repos.length,
    topSlugs: repos.slice(0, 5).map((r) => r.slug),
    scores: repos.map((r) => r.score ?? 0),
    latencyMs: { fts: latencyFtsMs, vector: latencyVectorMs, github: latencyGithubMs, total: latencyTotalMs },
  }).catch((e) => logger.warn({ err: e }, "Trace persist failed"));

  return {
    parsed,
    repos,
    ftsRepos,
    vectorRepos,
    githubRepos,
    mode,
  };
}

function getSearchSelectColumns() {
  const { fts, ...selectColumns } = getTableColumns(repos);
  void fts;
  return selectColumns;
}

type SearchSources = {
  ftsRepos: RepoDoc[];
  vectorRepos: RepoDoc[];
  githubRepos: RepoDoc[];
  limit: number;
  rerankLimit: number;
};

async function executeMode(
  queryText: string,
  parsed: ParsedQuery,
  mode: SearchMode,
  sources: SearchSources,
): Promise<RepoDoc[]> {
  switch (mode) {
    case "fts-only":
      return sources.ftsRepos.slice(0, sources.rerankLimit);
    case "vector-only":
      return sources.vectorRepos.slice(0, sources.rerankLimit);
    case "hybrid": {
      const weights = computeAdaptiveWeights(parsed, sources.ftsRepos.length, avgScore(sources.ftsRepos));
      return weightedRRF(
        [
          { repos: sources.ftsRepos, weight: weights.fts },
          { repos: sources.vectorRepos, weight: weights.vector },
        ],
        { k: 20 },
      ).slice(0, sources.rerankLimit);
    }
    case "hybrid+rerank": {
      const hybridRepos = await executeMode(queryText, parsed, "hybrid", sources);
      return rerankResults(queryText, hybridRepos, sources.rerankLimit);
    }
    case "hybrid+github-fallback": {
      const weights = computeAdaptiveWeights(parsed, sources.ftsRepos.length, avgScore(sources.ftsRepos));
      const mergedRepos = weightedRRF(
        [
          { repos: sources.ftsRepos, weight: weights.fts },
          { repos: sources.vectorRepos, weight: weights.vector },
          { repos: sources.githubRepos, weight: weights.github },
        ],
        { k: 20 },
      ).slice(0, Math.max(sources.limit * 2, 30));
      return rerankResults(queryText, mergedRepos, sources.rerankLimit);
    }
  }
}

async function rerankResults(
  queryText: string,
  repos: RepoDoc[],
  rerankLimit: number,
) {
  try {
    return await rerank(queryText, repos, rerankLimit);
  } catch (e) {
    logger.warn({ err: e }, "Re-ranking failed, using source order");
    return repos.slice(0, rerankLimit);
  }
}

// GitHub is rescue-only: only trigger when BOTH fts and vector signals are weak.
// vectorAvgScore uses cosine similarity (normalized [0,1]), which is more reliable
// than ts_rank_cd scores (unnormalized, frequently low even for correct results).
function shouldUseGithubFallback(
  parsed: ParsedQuery,
  ftsRepos: RepoDoc[],
  vectorRepos: RepoDoc[],
  options: SearchExecutionOptions,
) {
  if (options.disableGithubFallback) {
    return false;
  }
  const vectorAvgScore = avgScore(vectorRepos);
  return (
    parsed.githubQueries.length > 0 &&
    ftsRepos.length < 3 &&
    vectorAvgScore < 0.4
  );
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

  const selectColumns = getSearchSelectColumns();

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
  const selectColumns = getSearchSelectColumns();

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
  options: {
    persistResults?: boolean;
  } = {},
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

  if (options.persistResults ?? true) {
    await persistRepos(enriched);
    try {
      await upsertVectors(enriched);
    } catch (e) {
      logger.warn({ err: e }, "Vector upsert failed after GitHub search");
    }
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

export function computeAdaptiveWeights(
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
