import { db, repos } from "@/db";
import { parseQuery, generateCombos } from "@/lib/openai";
import { searchVectors } from "@/lib/qdrant";
import { rerank } from "@/services/reranker";
import { persistTrace } from "@/services/tracing";
import { logger } from "@/lib/logger";
import { sql, getTableColumns } from "drizzle-orm";
import type { RepoDoc, ParsedQuery, QueryType, SearchMode, SearchTrace } from "@/core/types";

type SearchOptions = {
  comboLimit?: number;
  generateCombos?: boolean;
  disableRerank?: boolean;
};

export type SearchExecutionOptions = {
  limit?: number;
  rerankLimit?: number;
  disableRerank?: boolean;
};

export type SearchRunResult = {
  parsed: ParsedQuery;
  repos: RepoDoc[];
  ftsRepos: RepoDoc[];
  vectorRepos: RepoDoc[];
  mode: SearchMode;
};

export async function search(
  queryText: string,
  options: number | SearchOptions = 3,
): Promise<{ parsed: ParsedQuery; repos: RepoDoc[]; combos: unknown[]; trace: SearchTrace }> {
  const comboLimit =
    typeof options === "number" ? options : (options.comboLimit ?? 3);
  const shouldGenerateCombos =
    typeof options === "number" ? true : (options.generateCombos ?? true);
  const disableRerank =
    typeof options === "number" ? false : (options.disableRerank ?? false);

  const result = await runSearchMode(queryText, "hybrid+rerank", {
    disableRerank,
  });

  const combos = shouldGenerateCombos && result.repos.length >= 2
    ? await generateCombos(result.repos, queryText, comboLimit)
    : [];

  return { parsed: result.parsed, repos: result.repos, combos, trace: result.trace };
}

export async function runSearchMode(
  queryText: string,
  mode: SearchMode,
  options: SearchExecutionOptions = {},
): Promise<SearchRunResult & { trace: SearchTrace }> {
  const parsed = await parseQuery(queryText);
  logger.info({ parsed, mode }, "Query parsed");

  const limit = options.limit ?? 12;
  const rerankLimit = options.rerankLimit ?? 15;
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

  const repos = await executeMode(queryText, parsed, mode, {
    ftsRepos,
    vectorRepos,
    limit,
    rerankLimit,
    disableRerank: options.disableRerank ?? false,
  });

  if (process.env.ENABLE_PRIMITIVE_BOOST === "true") {
    const queryPrimitives = parsed.capabilityTerms;
    repos.forEach((r) => {
      if (r.primitives?.some((p) => queryPrimitives.some((qp) => p.toLowerCase().includes(qp.toLowerCase())))) {
        r.score = (r.score ?? 0) * 1.15;
      }
    });
    repos.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  const latencyTotalMs = performance.now() - t0;

  const trace: SearchTrace = {
    ftsCount: ftsRepos.length,
    vectorCount: vectorRepos.length,
    githubCount: 0,
    githubTriggered: false,
    mergedCount: repos.length,
    rerankedCount: repos.length,
    topSlugs: repos.slice(0, 5).map((r) => r.slug),
    latencyFtsMs,
    latencyVectorMs,
    latencyGithubMs: null,
    latencyTotalMs,
  };

  logger.info(
    {
      mode,
      fts: ftsRepos.length,
      vector: vectorRepos.length,
      returned: repos.length,
    },
    "Search mode complete",
  );

  try {
    trace.id = await persistTrace({
      queryText,
      parsed,
      ftsCount: trace.ftsCount,
      vectorCount: trace.vectorCount,
      githubCount: trace.githubCount,
      githubTriggered: trace.githubTriggered,
      mergedCount: trace.mergedCount,
      rerankedCount: trace.rerankedCount,
      topSlugs: trace.topSlugs,
      scores: repos.map((r) => r.score ?? 0),
      latencyMs: { fts: trace.latencyFtsMs, vector: trace.latencyVectorMs, github: trace.latencyGithubMs, total: trace.latencyTotalMs },
    });
  } catch (e) {
    logger.warn({ err: e }, "Trace persist failed");
  }

  return {
    parsed,
    repos,
    ftsRepos,
    vectorRepos,
    mode,
    trace,
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
  limit: number;
  rerankLimit: number;
  disableRerank: boolean;
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
      return sources.disableRerank
        ? hybridRepos.slice(0, sources.rerankLimit)
        : rerankResults(queryText, hybridRepos, sources.rerankLimit);
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

// ── Adaptive RRF Weights ────────────────────────────────────────────────────

export function computeAdaptiveWeights(
  parsed: ParsedQuery,
  ftsCount: number,
  ftsAvgScore: number,
): { fts: number; vector: number } {
  const w = { fts: 1.4, vector: 1.2 };

  const qt: QueryType = parsed.queryType ?? "capability_search";

  if (parsed.intentType === "lookup" || qt === "specific_tool") {
    w.fts *= 1.3;
    w.vector *= 0.7;
  }
  if (parsed.intentType === "explore" || qt === "capability_search") {
    w.vector *= 1.3;
  }
  if (parsed.intentType === "build") {
    w.vector *= 1.2;
  }
  if (qt === "alternative") {
    w.vector *= 1.4;
  }
  if (qt === "comparison") {
    w.fts *= 1.2;
    w.vector *= 1.2;
  }

  if (ftsCount < 3) {
    w.vector *= 1.2;
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
