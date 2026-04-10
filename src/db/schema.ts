import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  boolean,
  numeric,
  real,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/*  Custom tsvector type for PostgreSQL Full-Text Search               */
/* ------------------------------------------------------------------ */
const tsVector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const repos = pgTable(
  "repos",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    readme: text("readme"),
    language: text("language"),
    topics: jsonb("topics").$type<string[]>().default([]),
    stars: integer("stars").default(0),
    starsDelta30d: integer("stars_delta_30d").default(0),
    trendScore: numeric("trend_score"),
    sourceRank: integer("source_rank").default(0),
    capabilities: jsonb("capabilities").$type<string[]>().default([]),
    primitives: jsonb("primitives").$type<string[]>().default([]),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

    /* ----------------------------------------------------------------
     * Full-Text Search vector — STORED generated column.
     * Weights:  A = slug + name  |  B = description  |  C = readme
     *           D = topics + capabilities (jsonb string[] → text)
     * Auto-updated by PostgreSQL on every INSERT/UPDATE.
     * ---------------------------------------------------------------- */
    fts: tsVector("fts").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce("slug", '') || ' ' || coalesce("name", '')), 'A') ||
          setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
          setweight(to_tsvector('english', left(coalesce("readme", ''), 4000)), 'C') ||
          setweight(to_tsvector('english', regexp_replace(coalesce("topics"::text, ''), '["\[\]{}]', ' ', 'g') || ' ' || regexp_replace(coalesce("capabilities"::text, ''), '["\[\]{}]', ' ', 'g')), 'D')`,
    ),
  },
  (t) => [
    index("repos_language_idx").on(t.language),
    index("repos_fts_idx").using("gin", t.fts),
  ],
);

export const combos = pgTable(
  "combos",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    thesis: text("thesis").notNull(),
    formula: text("formula"),
    repoSlugs: jsonb("repo_slugs").$type<string[]>().default([]),
    repoRoles: jsonb("repo_roles").$type<Record<string, string>>().default({}),
    steps: jsonb("steps").$type<string[]>().default([]),
    recommendedShell: text("recommended_shell").default("web"),
    whatIsBeingCombined: text("what_is_being_combined"),
    capabilities: jsonb("capabilities").$type<string[]>().default([]),
    supportingPrimitives: jsonb("supporting_primitives").$type<string[]>().default([]),
    whyFit: text("why_fit"),
    useCase: text("use_case"),
    whyBetterThanSingle: text("why_better_than_single"),
    firstUser: text("first_user"),
    demo72h: text("demo_72h"),
    keyRisks: jsonb("key_risks").$type<string[]>().default([]),
    scores: jsonb("scores").$type<{
      novelty?: number;
      composableFit?: number;
      accessibilityWedge?: number;
      timeToDemo?: number;
      categoryUpside?: number;
      narrativeClarity?: number;
    }>().default({}),
    queryText: text("query_text"),
    saved: boolean("saved").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("combos_query_title_idx").on(t.queryText, t.title)],
);

export const scanLog = pgTable("scan_log", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  reposFound: integer("repos_found").default(0),
  reposEnriched: integer("repos_enriched").default(0),
  status: text("status").notNull().default("running"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    eventType: text("event_type").notNull(),
    queryText: text("query_text"),
    repoSlug: text("repo_slug"),
    comboId: integer("combo_id"),
    page: text("page"),
    source: text("source"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("events_event_type_created_at_idx").on(t.eventType, t.createdAt),
    index("events_session_id_created_at_idx").on(t.sessionId, t.createdAt),
    index("events_combo_id_idx").on(t.comboId),
    index("events_repo_slug_idx").on(t.repoSlug),
  ],
);

export const retrievalTraces = pgTable("retrieval_traces", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  queryText: text("query_text").notNull(),
  intentType: text("intent_type").notNull(),
  queryType: text("query_type").notNull(),
  vectorMode: text("vector_mode").notNull().default("hybrid"),
  ftsCount: integer("fts_count").notNull(),
  vectorCount: integer("vector_count").notNull(),
  githubCount: integer("github_count").notNull(),
  githubTriggered: boolean("github_triggered").notNull(),
  mergedCount: integer("merged_count").notNull(),
  rerankedCount: integer("reranked_count").notNull(),
  topSlugs: jsonb("top_slugs").$type<string[]>(),
  scoreP50: real("score_p50"),
  scoreP90: real("score_p90"),
  latencyFtsMs: integer("latency_fts_ms"),
  latencyVectorMs: integer("latency_vector_ms"),
  latencyGithubMs: integer("latency_github_ms"),
  latencyTotalMs: integer("latency_total_ms"),
});

export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;
export type Combo = typeof combos.$inferSelect;
export type NewCombo = typeof combos.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type RetrievalTrace = typeof retrievalTraces.$inferSelect;
