import { db, repos } from "@/db";
import { searchMulti, fetchReadme } from "@/lib/github";
import { parseQuery, generateCombos } from "@/lib/openai";
import { searchVectors, upsertVectors } from "@/lib/qdrant";
import { logger } from "@/lib/logger";
import { sql, getTableColumns } from "drizzle-orm";
import type { RepoDoc, ParsedQuery } from "@/core/types";

export async function search(
  queryText: string,
  comboLimit = 3,
): Promise<{ parsed: ParsedQuery; repos: RepoDoc[]; combos: unknown[] }> {
  const parsed = await parseQuery(queryText);
  logger.info({ parsed }, "Query parsed");

  // Build enriched query for vector search: parsed terms only, no raw query duplication.
  // anchorTerms + capabilityTerms already contain AI-extracted intent — no need to repeat queryText.
  const enrichedVectorQuery = [
    ...parsed.anchorTerms,
    ...parsed.capabilityTerms,
  ].join(" ") || queryText;

  // Determine up front whether we need GitHub (can't know without lexical result,
  // but we can predict: explore/build intents almost always need it)
  const intentNeedsGithub =
    parsed.intentType === "explore" || parsed.intentType === "build";

  // --- Run FTS and vector search in parallel ---
  // GitHub search is conditional on lexical results, so it runs in a second wave.
  const [ftsResult, vectorResult] = await Promise.allSettled([
    lexicalSearch(parsed, 12),
    searchVectors(enrichedVectorQuery, parsed, 8),
  ]);

  const ftsRepos: RepoDoc[] =
    ftsResult.status === "fulfilled" ? ftsResult.value : [];
  const vectorRepos: RepoDoc[] =
    vectorResult.status === "fulfilled" ? vectorResult.value : [];

  if (ftsResult.status === "rejected")
    logger.warn({ err: ftsResult.reason }, "FTS search failed");
  if (vectorResult.status === "rejected")
    logger.warn({ err: vectorResult.reason }, "Vector search failed");

  // Decide whether to hit GitHub based on FTS outcome + intent
  const needsGithub =
    intentNeedsGithub ||
    ftsRepos.length < 4 ||
    avgScore(ftsRepos) < 0.5;

  let githubRepos: RepoDoc[] = [];
  if (needsGithub && parsed.githubQueries.length > 0) {
    githubRepos = await searchFromGithub(parsed.githubQueries, 15);
  }

  // Fuse all three ranked lists with Weighted RRF
  const allRepos = weightedRRF(
    [
      { repos: ftsRepos,     weight: 1.4 }, // FTS: highest weight — keyword precision
      { repos: vectorRepos,  weight: 1.2 }, // Vector: semantic coverage
      { repos: githubRepos,  weight: 1.0 }, // GitHub: freshness / long-tail
    ],
    { k: 20 },
  ).slice(0, 15);

  logger.info(
    { fts: ftsRepos.length, vector: vectorRepos.length, github: githubRepos.length, merged: allRepos.length },
    "Search sources merged via RRF",
  );

  const combos = allRepos.length >= 2
    ? await generateCombos(allRepos, queryText, comboLimit)
    : [];

  return { parsed, repos: allRepos, combos };
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

  // Build a tsquery string: "claude code context management" → "claude & code & context & management"
  // Using plainto_tsquery handles stemming and stop-words automatically.
  const rawQuery = terms.join(" ");

  // Exclude the generated `fts` column from SELECT (it's a large tsvector blob)
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

  // Fallback: if FTS returned nothing (e.g. all terms are stop-words, or
  // the generated column hasn't been backfilled yet), use ILIKE as before.
  logger.info({ terms }, "FTS returned 0 results, falling back to ILIKE");
  return ilikeFallback(terms, limit);
}

/** ILIKE fallback — kept for graceful degradation before migration runs */
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

/** Map a DB row to a RepoDoc */
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

// ── Weighted Reciprocal Rank Fusion ─────────────────────────────────────────
//
// Classic RRF: score(d) = Σ  1 / (k + rank_i(d))
// Weighted RRF: score(d) = Σ  w_i / (k + rank_i(d))
//
// k=20 is tuned for small result sets (FTS:12, GitHub:15, Vector:8).
// With k=60 (web-search standard), the score differences across ranks
// become negligible at our scale.
//
// Source weights reflect precision/recall tradeoffs:
//   FTS 1.4  — exact keyword match on slug/name has highest precision
//   Vector 1.2 — semantic coverage, good recall for paraphrases
//   GitHub 1.0 — freshness/long-tail, lower precision (sorted by stars)

interface RankedSource {
  repos: RepoDoc[];
  weight: number;
}

export function weightedRRF(
  sources: RankedSource[],
  { k = 20 }: { k?: number } = {},
): RepoDoc[] {
  // slug → { rrfScore, merged RepoDoc }
  const scores = new Map<string, { score: number; doc: RepoDoc }>();

  for (const { repos, weight } of sources) {
    for (let rank = 0; rank < repos.length; rank++) {
      const r = repos[rank];
      const contribution = weight / (k + rank + 1); // rank is 0-indexed
      const existing = scores.get(r.slug);
      if (existing) {
        existing.score += contribution;
        // Merge metadata: prefer the richer value from whichever source has it
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
