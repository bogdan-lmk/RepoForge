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

export type QueryType =
  | "specific_tool"
  | "capability_search"
  | "comparison"
  | "alternative"
  | "tutorial";

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
  novelty: number;
  composableFit: number;
  accessibilityWedge: number;
  timeToDemo: number;
  categoryUpside: number;
  narrativeClarity: number;
}

export interface ComboIdea {
  id?: number | null;
  title: string;
  thesis: string;
  formula: string;
  repoSlugs: string[];
  repoRoles: Record<string, string>;
  steps: string[];
  recommendedShell: string;
  whatIsBeingCombined: string;
  capabilities: string[];
  supportingPrimitives: string[];
  whyFit: string;
  useCase: string;
  whyBetterThanSingle: string;
  firstUser: string;
  demo72h: string;
  keyRisks: string[];
  scores: ComboScores;
}

export interface TrendingRepo {
  slug: string;
  name: string;
  stars: number;
  trendScore: number;
}
