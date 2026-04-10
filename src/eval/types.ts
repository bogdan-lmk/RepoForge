export interface RetrievalTrace {
  queryText: string;
  intentType: string;
  queryType: string;
  vectorMode: "hybrid" | "dense-only";
  ftsCount: number;
  vectorCount: number;
  githubCount: number;
  githubTriggered: boolean;
  mergedCount: number;
  rerankedCount: number;
  topSlugs: string[];
  scoreP50: number | null;
  scoreP90: number | null;
  latencyMs: {
    fts: number;
    vector: number;
    github: number | null;
    total: number;
  };
}

export interface BenchResult {
  query: string;
  trace: RetrievalTrace;
  passed: boolean;
  failures: string[];
}
