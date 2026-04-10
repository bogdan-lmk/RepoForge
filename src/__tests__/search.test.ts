import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RepoDoc, ParsedQuery } from "@/core/types";

const { mockLimit, mockOnConflictDoUpdate, mockParseQuery, mockGenerateCombos, mockSearchVectors, mockUpsertVectors, mockSearchMulti, mockRerank } =
  vi.hoisted(() => ({
    mockLimit: vi.fn().mockResolvedValue([]),
    mockOnConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    mockParseQuery: vi.fn(),
    mockGenerateCombos: vi.fn().mockResolvedValue([]),
    mockSearchVectors: vi.fn().mockResolvedValue([]),
    mockUpsertVectors: vi.fn().mockResolvedValue(undefined),
    mockSearchMulti: vi.fn().mockResolvedValue([]),
    mockRerank: vi.fn(),
  }));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/openai", () => ({
  parseQuery: (...args: unknown[]) => mockParseQuery(...args),
  generateCombos: (...args: unknown[]) => mockGenerateCombos(...args),
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

vi.mock("@/lib/qdrant", () => ({
  searchVectors: (...args: unknown[]) => mockSearchVectors(...args),
  upsertVectors: (...args: unknown[]) => mockUpsertVectors(...args),
  buildEmbedText: vi.fn(() => "text"),
}));

vi.mock("@/lib/github", () => ({
  searchMulti: (...args: unknown[]) => mockSearchMulti(...args),
  fetchReadme: vi.fn().mockResolvedValue(""),
}));

vi.mock("@/services/reranker", () => ({
  rerank: (...args: unknown[]) => mockRerank(...args),
}));

vi.mock("@/db", async () => {
  const schema = await vi.importActual<typeof import("@/db/schema")>("@/db/schema");
  return {
    ...schema,
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: mockLimit,
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: mockOnConflictDoUpdate,
    },
  };
});

import { computeAdaptiveWeights, runSearchMode, search } from "@/services/search";

function makeParsed(overrides: Partial<ParsedQuery> = {}): ParsedQuery {
  return {
    text: "claude code context management",
    anchorTerms: ["claude"],
    capabilityTerms: ["context management"],
    intentType: "lookup",
    queryType: "specific_tool",
    requiredEntities: ["claude"],
    githubQueries: ["claude OR ai coding"],
    ...overrides,
  };
}

function makeRepo(slug: string, source: string, score: number): RepoDoc {
  return {
    slug,
    name: slug.split("/")[1] ?? slug,
    url: `https://github.com/${slug}`,
    description: `Repo ${slug}`,
    readme: "",
    language: "TypeScript",
    topics: [],
    stars: 100,
    capabilities: [],
    primitives: [],
    score,
    source,
  };
}

function ftsRow(repo: RepoDoc) {
  return {
    id: 1,
    slug: repo.slug,
    name: repo.name,
    url: repo.url,
    description: repo.description,
    readme: repo.readme,
    language: repo.language,
    topics: repo.topics,
    stars: repo.stars,
    capabilities: repo.capabilities,
    primitives: repo.primitives,
    starsDelta30d: null,
    trendScore: null,
    sourceRank: 0,
    discoveredAt: new Date(),
    updatedAt: new Date(),
    rank: repo.score,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockParseQuery.mockResolvedValue(makeParsed());
  mockGenerateCombos.mockResolvedValue([]);
  mockSearchVectors.mockResolvedValue([]);
  mockSearchMulti.mockResolvedValue([]);
  mockLimit.mockResolvedValue([]);
  mockRerank.mockImplementation((_q: string, repos: RepoDoc[]) => Promise.resolve(repos));
});

describe("search", () => {
  it("skips GitHub when FTS returns >= 4 results with high scores and intent is lookup", async () => {
    const ftsRepos = Array.from({ length: 5 }, (_, i) =>
      makeRepo(`fts/repo-${i}`, "fts", 0.8),
    );
    mockLimit.mockResolvedValue(ftsRepos.map(ftsRow));
    mockSearchVectors.mockResolvedValue([
      makeRepo("vector/repo-v1", "vector", 0.9),
    ]);

    const result = await search("claude code context management");

    expect(result.repos.length).toBeGreaterThan(0);
    expect(mockSearchVectors).toHaveBeenCalled();
    expect(mockSearchMulti).not.toHaveBeenCalled();
  });

  it("triggers GitHub search when FTS returns < 4 results", async () => {
    mockParseQuery.mockResolvedValue(
      makeParsed({ intentType: "explore", anchorTerms: ["obscure-lib"], queryType: "capability_search", requiredEntities: [] }),
    );
    mockSearchVectors.mockResolvedValue([]);

    const ftsRepos = [makeRepo("fts/solo", "fts", 0.3)];
    mockLimit.mockResolvedValue(ftsRepos.map(ftsRow));

    const githubRepos = [
      makeRepo("gh/fresh-repo", "github", 0.5),
      makeRepo("gh/another", "github", 0.4),
    ];
    mockSearchMulti.mockResolvedValue(githubRepos);

    const result = await search("obscure-lib tool");

    expect(mockSearchMulti).toHaveBeenCalled();
    expect(result.repos.length).toBeGreaterThan(0);
  });

  it("continues when vector search fails (rejected promise)", async () => {
    mockSearchVectors.mockRejectedValue(new Error("Qdrant down"));

    const ftsRepos = Array.from({ length: 5 }, (_, i) =>
      makeRepo(`fts/repo-${i}`, "fts", 0.7),
    );
    mockLimit.mockResolvedValue(ftsRepos.map(ftsRow));

    const result = await search("something reliable");

    expect(result.repos.length).toBeGreaterThan(0);
  });

  it("uses enriched query from parsed terms for vector search", async () => {
    const parsed = makeParsed({
      anchorTerms: ["claude", "supabase"],
      capabilityTerms: ["context management", "rag pipeline"],
    });
    mockParseQuery.mockResolvedValue(parsed);

    const ftsRepos = Array.from({ length: 5 }, (_, i) =>
      makeRepo(`fts/repo-${i}`, "fts", 0.7),
    );
    mockLimit.mockResolvedValue(ftsRepos.map(ftsRow));

    await search("claude supabase context management");

    const vectorCall = mockSearchVectors.mock.calls[0];
    expect(vectorCall[0]).toBe("claude supabase context management rag pipeline");
  });

  it("falls back to raw queryText when parsed terms are empty", async () => {
    mockParseQuery.mockResolvedValue(
      makeParsed({ anchorTerms: [], capabilityTerms: [] }),
    );

    const ftsRepos = Array.from({ length: 5 }, (_, i) =>
      makeRepo(`fts/repo-${i}`, "fts", 0.7),
    );
    mockLimit.mockResolvedValue(ftsRepos.map(ftsRow));

    await search("something vague");

    const vectorCall = mockSearchVectors.mock.calls[0];
    expect(vectorCall[0]).toBe("something vague");
  });

  it("uses ilikeFallback when FTS returns 0 results", async () => {
    const ilikeRepo = makeRepo("found/ilike-match", "lexical", 0.65);

    mockLimit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ftsRow(ilikeRepo)]);

    const result = await search("obscure-term-xyz");

    expect(result.repos.length).toBeGreaterThan(0);
  });

  it("calls persistRepos when GitHub results come in", async () => {
    mockParseQuery.mockResolvedValue(
      makeParsed({ intentType: "explore", queryType: "capability_search", requiredEntities: [] }),
    );
    mockSearchVectors.mockResolvedValue([]);
    mockLimit.mockResolvedValue([]);

    const githubRepo = makeRepo("gh/new-repo", "github", 0.5);
    githubRepo.capabilities = ["auto-generated"];
    githubRepo.primitives = ["api-call"];
    mockSearchMulti.mockResolvedValue([githubRepo]);

    await search("some query");

    expect(mockOnConflictDoUpdate).toHaveBeenCalled();
    expect(mockUpsertVectors).toHaveBeenCalled();
  });

  it("handles FTS rejection gracefully and falls through to GitHub", async () => {
    mockParseQuery.mockResolvedValue(
      makeParsed({ intentType: "explore", queryType: "capability_search", requiredEntities: [] }),
    );
    mockLimit.mockRejectedValue(new Error("DB connection lost"));

    const githubRepo = makeRepo("gh/fallback", "github", 0.5);
    mockSearchMulti.mockResolvedValue([githubRepo]);

    const result = await search("broken query");

    expect(result.repos.some((r) => r.slug === "gh/fallback")).toBe(true);
  });

  it("generates combos when 2+ repos found", async () => {
    const ftsRepos = Array.from({ length: 5 }, (_, i) =>
      makeRepo(`fts/repo-${i}`, "fts", 0.8),
    );
    mockLimit.mockResolvedValue(ftsRepos.map(ftsRow));
    mockGenerateCombos.mockResolvedValue([{ title: "Cool combo" }]);

    const result = await search("multi-repo query");

    expect(result.repos.length).toBeGreaterThanOrEqual(2);
    expect(mockGenerateCombos).toHaveBeenCalled();
    expect(result.combos.length).toBeGreaterThan(0);
  });

  it("skips combo generation when disabled for eval mode", async () => {
    const ftsRepos = Array.from({ length: 5 }, (_, i) =>
      makeRepo(`fts/repo-${i}`, "fts", 0.8),
    );
    mockLimit.mockResolvedValue(ftsRepos.map(ftsRow));

    const result = await search("query lab baseline", {
      generateCombos: false,
    });

    expect(result.combos).toEqual([]);
    expect(mockGenerateCombos).not.toHaveBeenCalled();
  });

  it("skips combos when fewer than 2 repos", async () => {
    mockLimit.mockResolvedValue([]);
    mockSearchVectors.mockResolvedValue([]);
    mockRerank.mockResolvedValue([]);

    await search("nothing found");

    expect(mockGenerateCombos).not.toHaveBeenCalled();
  });

  it("handles upsertVectors failure in GitHub path gracefully", async () => {
    mockParseQuery.mockResolvedValue(makeParsed({ intentType: "explore", queryType: "capability_search", requiredEntities: [] }));
    mockLimit.mockResolvedValue([]);
    mockUpsertVectors.mockRejectedValue(new Error("Qdrant write error"));

    const githubRepo = makeRepo("gh/resilient", "github", 0.5);
    mockSearchMulti.mockResolvedValue([githubRepo]);

    const result = await search("resilient query");

    expect(result.repos.some((r) => r.slug === "gh/resilient")).toBe(true);
  });

  it("calls reranker with RRF merged results", async () => {
    const ftsRepos = Array.from({ length: 5 }, (_, i) =>
      makeRepo(`fts/repo-${i}`, "fts", 0.8),
    );
    mockLimit.mockResolvedValue(ftsRepos.map(ftsRow));

    await search("rerank test");

    expect(mockRerank).toHaveBeenCalled();
    expect(mockRerank.mock.calls[0][0]).toBe("rerank test");
    expect(mockRerank.mock.calls[0][2]).toBe(15);
  });

  it("handles reranker failure gracefully", async () => {
    const ftsRepos = Array.from({ length: 5 }, (_, i) =>
      makeRepo(`fts/repo-${i}`, "fts", 0.8),
    );
    mockLimit.mockResolvedValue(ftsRepos.map(ftsRow));
    mockRerank.mockRejectedValue(new Error("Model load failed")).mockResolvedValue(ftsRepos);

    const result = await search("graceful rerank");

    expect(result.repos.length).toBeGreaterThan(0);
  });

  it("re-scores GitHub results based on text relevance", async () => {
    mockParseQuery.mockResolvedValue(
      makeParsed({
        intentType: "explore",
        anchorTerms: ["notebooklm"],
        capabilityTerms: ["python api"],
        queryType: "specific_tool",
        requiredEntities: ["notebooklm"],
        githubQueries: ["notebooklm python"],
      }),
    );
    mockSearchVectors.mockResolvedValue([]);
    mockLimit.mockResolvedValue([]);

    const popular = makeRepo("someone/random-lib", "github", 0);
    popular.description = "A random popular library";
    popular.stars = 50000;

    const relevant = makeRepo("teng-lin/notebooklm-py", "github", 0);
    relevant.description = "Unofficial Python API for Google NotebookLM";
    relevant.stars = 9000;
    relevant.topics = ["notebooklm", "python-api"];

    mockSearchMulti.mockResolvedValue([popular, relevant]);

    await search("python api for notebookLM");

    const rerankCall = mockRerank.mock.calls[0];
    const repos = rerankCall[1] as RepoDoc[];
    const notebooklmIdx = repos.findIndex((r: RepoDoc) => r.slug === "teng-lin/notebooklm-py");
    const randomIdx = repos.findIndex((r: RepoDoc) => r.slug === "someone/random-lib");
    expect(notebooklmIdx).toBeLessThan(randomIdx);
  });

  it("boosts FTS and dampens vector weight for lookup queries", () => {
    const weights = computeAdaptiveWeights(
      makeParsed({
        intentType: "lookup",
        queryType: "specific_tool",
      }),
      6,
      0.4,
    );

    expect(weights.fts).toBeCloseTo(1.82);
    expect(weights.vector).toBeCloseTo(0.84);
    expect(weights.github).toBeCloseTo(1);
  });

  it("boosts vector and GitHub weights for exploratory queries with weak lexical recall", () => {
    const weights = computeAdaptiveWeights(
      makeParsed({
        intentType: "explore",
        queryType: "capability_search",
      }),
      2,
      0.8,
    );

    expect(weights.fts).toBeCloseTo(1.61);
    expect(weights.vector).toBeCloseTo(1.872);
    expect(weights.github).toBeCloseTo(1.44);
  });

  it("applies build and alternative boosts together when both signals are present", () => {
    const weights = computeAdaptiveWeights(
      makeParsed({
        intentType: "build",
        queryType: "alternative",
      }),
      4,
      0.4,
    );

    expect(weights.fts).toBeCloseTo(1.4);
    expect(weights.vector).toBeCloseTo(2.016);
    expect(weights.github).toBeCloseTo(1.44);
  });

  it("boosts both lexical and vector channels for comparison queries", () => {
    const weights = computeAdaptiveWeights(
      makeParsed({
        intentType: "lookup",
        queryType: "comparison",
      }),
      4,
      0.4,
    );

    expect(weights.fts).toBeCloseTo(2.184);
    expect(weights.vector).toBeCloseTo(1.008);
    expect(weights.github).toBeCloseTo(1);
  });

  it("returns only lexical results in fts-only mode", async () => {
    const ftsRepos = Array.from({ length: 5 }, (_, i) =>
      makeRepo(`fts/repo-${i}`, "fts", 0.8),
    );
    mockLimit.mockResolvedValue(ftsRepos.map(ftsRow));
    mockSearchVectors.mockResolvedValue([makeRepo("vector/repo-v1", "vector", 0.9)]);

    const result = await runSearchMode("fts only", "fts-only");

    expect(result.repos.every((repo) => repo.source === "fts")).toBe(true);
  });

  it("returns only vector results in vector-only mode", async () => {
    mockLimit.mockResolvedValue([]);
    mockSearchVectors.mockResolvedValue([
      makeRepo("vector/repo-v1", "vector", 0.9),
      makeRepo("vector/repo-v2", "vector", 0.8),
    ]);

    const result = await runSearchMode("vector only", "vector-only");

    expect(result.repos).toHaveLength(2);
    expect(result.repos.every((repo) => repo.source === "vector")).toBe(true);
  });

  it("does not hit GitHub in hybrid+rerank mode", async () => {
    const ftsRepos = Array.from({ length: 2 }, (_, i) =>
      makeRepo(`fts/repo-${i}`, "fts", 0.8),
    );
    mockLimit.mockResolvedValue(ftsRepos.map(ftsRow));
    mockSearchVectors.mockResolvedValue([makeRepo("vector/repo-v1", "vector", 0.9)]);

    await runSearchMode("hybrid rerank", "hybrid+rerank");

    expect(mockSearchMulti).not.toHaveBeenCalled();
    expect(mockRerank).toHaveBeenCalled();
  });
});
