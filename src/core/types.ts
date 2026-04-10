export interface RepoDoc {
  slug: string;
  name: string;
  url: string;
  description: string;
  readme: string;
  language: string | null;
  topics: string[];
  stars: number;
  capabilities: string[];
  primitives: string[];
  score?: number;
  source?: string;
}

export const EVENT_TYPES = [
  "search_started",
  "results_rendered",
  "search_failed",
  "repo_opened",
  "combo_expanded",
  "combo_saved",
  "query_retried",
  "chip_clicked",
  "dice_clicked",
  "combo_save_failed",
  "combo_steps_viewed",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface EventInput {
  type: EventType;
  queryText?: string | null;
  repoSlug?: string | null;
  comboId?: number | null;
  page?: string | null;
  source?: string | null;
  payload?: Record<string, unknown>;
}

export type QueryType =
  | "specific_tool"
  | "capability_search"
  | "comparison"
  | "alternative"
  | "tutorial";

export const SEARCH_MODES = [
  "fts-only",
  "vector-only",
  "hybrid",
  "hybrid+rerank",
] as const;

export type SearchMode = (typeof SEARCH_MODES)[number];

export interface SearchTrace {
  id?: number;
  ftsCount: number;
  vectorCount: number;
  githubCount: number;
  githubTriggered: boolean;
  mergedCount: number;
  rerankedCount: number;
  topSlugs: string[];
  latencyFtsMs: number;
  latencyVectorMs: number;
  latencyGithubMs: number | null;
  latencyTotalMs: number;
}

export interface ParsedQuery {
  text: string;
  anchorTerms: string[];
  capabilityTerms: string[];
  intentType: "explore" | "build" | "lookup";
  queryType: QueryType;
  requiredEntities: string[];
  githubQueries: string[];
}

export interface ComboScores {
  novelty?: number;
  composableFit?: number;
  accessibilityWedge?: number;
  timeToDemo?: number;
  categoryUpside?: number;
  narrativeClarity?: number;
}

export interface ComboIdea {
  id?: number | null;
  title: string;
  thesis: string;
  formula: string | null;
  repoSlugs: string[];
  repoRoles: Record<string, string>;
  steps: string[];
  recommendedShell: string | null;
  whatIsBeingCombined: string | null;
  capabilities: string[];
  supportingPrimitives: string[];
  whyFit: string | null;
  useCase: string | null;
  whyBetterThanSingle: string | null;
  firstUser: string | null;
  demo72h: string | null;
  keyRisks: string[];
  scores: ComboScores;
  queryText?: string | null;
  isFeatured?: boolean;
}

export interface TrendingRepo {
  slug: string;
  name: string;
  stars: number;
  trendScore: number;
}
