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
} from "drizzle-orm/pg-core";

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
  },
  (t) => [index("repos_language_idx").on(t.language)],
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

export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;
export type Combo = typeof combos.$inferSelect;
export type NewCombo = typeof combos.$inferInsert;
