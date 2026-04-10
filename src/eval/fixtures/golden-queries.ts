export interface GoldenQuery {
  text: string;
  expectedIntent: "explore" | "build" | "lookup";
  expectedQueryType: "specific_tool" | "capability_search" | "alternative" | "comparison" | "tutorial";
  /** Minimum FTS results expected */
  minFtsCount: number;
  /** Minimum vector results expected */
  minVectorCount: number;
  /** Minimum merged results before reranking */
  minMergedCount: number;
  /** Maximum acceptable total pipeline latency in ms */
  maxLatencyMs: number;
}

export const GOLDEN_QUERIES: GoldenQuery[] = [
  // --- lookup / specific_tool ---
  {
    text: "claude mcp server",
    expectedIntent: "lookup",
    expectedQueryType: "specific_tool",
    minFtsCount: 1,
    minVectorCount: 1,
    minMergedCount: 2,
    maxLatencyMs: 5000,
  },
  {
    text: "supabase realtime subscriptions",
    expectedIntent: "lookup",
    expectedQueryType: "specific_tool",
    minFtsCount: 1,
    minVectorCount: 1,
    minMergedCount: 2,
    maxLatencyMs: 5000,
  },
  // --- explore / capability_search ---
  {
    text: "tools for building AI agents with memory",
    expectedIntent: "explore",
    expectedQueryType: "capability_search",
    minFtsCount: 0,
    minVectorCount: 2,
    minMergedCount: 2,
    maxLatencyMs: 8000,
  },
  {
    text: "open source analytics dashboard for startups",
    expectedIntent: "explore",
    expectedQueryType: "capability_search",
    minFtsCount: 0,
    minVectorCount: 2,
    minMergedCount: 2,
    maxLatencyMs: 8000,
  },
  {
    text: "vector database for semantic search",
    expectedIntent: "explore",
    expectedQueryType: "capability_search",
    minFtsCount: 0,
    minVectorCount: 2,
    minMergedCount: 2,
    maxLatencyMs: 8000,
  },
  // --- build ---
  {
    text: "build a RAG pipeline with Next.js and Postgres",
    expectedIntent: "build",
    expectedQueryType: "capability_search",
    minFtsCount: 0,
    minVectorCount: 2,
    minMergedCount: 2,
    maxLatencyMs: 8000,
  },
  {
    text: "build a developer documentation site with AI search",
    expectedIntent: "build",
    expectedQueryType: "capability_search",
    minFtsCount: 0,
    minVectorCount: 1,
    minMergedCount: 2,
    maxLatencyMs: 8000,
  },
  // --- alternative ---
  {
    text: "alternatives to Stripe for payment processing",
    expectedIntent: "explore",
    expectedQueryType: "alternative",
    minFtsCount: 0,
    minVectorCount: 2,
    minMergedCount: 2,
    maxLatencyMs: 8000,
  },
  // --- comparison ---
  {
    text: "Langchain vs LlamaIndex for document QA",
    expectedIntent: "lookup",
    expectedQueryType: "comparison",
    minFtsCount: 0,
    minVectorCount: 1,
    minMergedCount: 1,
    maxLatencyMs: 6000,
  },
  // --- tutorial ---
  {
    text: "how to add authentication to a Next.js app",
    expectedIntent: "build",
    expectedQueryType: "tutorial",
    minFtsCount: 0,
    minVectorCount: 1,
    minMergedCount: 1,
    maxLatencyMs: 8000,
  },
];
