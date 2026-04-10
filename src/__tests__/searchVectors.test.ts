import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ParsedQuery } from "@/core/types";
import { env } from "@/env";

const { mockQuery, mockSearch, mockGetCollections, mockGetCollection, mockCreateCollection, mockCreatePayloadIndex, mockGenerateEmbedding } =
  vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockSearch: vi.fn(),
    mockGetCollections: vi.fn(),
    mockGetCollection: vi.fn(),
    mockCreateCollection: vi.fn(),
    mockCreatePayloadIndex: vi.fn(),
    mockGenerateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
  }));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@qdrant/js-client-rest", () => ({
  QdrantClient: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.getCollections = mockGetCollections;
    this.getCollection = mockGetCollection;
    this.createCollection = mockCreateCollection;
    this.createPayloadIndex = mockCreatePayloadIndex;
    this.query = mockQuery;
    this.search = mockSearch;
  }),
}));

vi.mock("@/lib/openai", () => ({
  generateEmbedding: mockGenerateEmbedding,
}));

import { searchVectors } from "@/lib/qdrant";

function makeParsed(overrides: Partial<ParsedQuery> = {}): ParsedQuery {
  return {
    text: "claude code context management",
    anchorTerms: [],
    capabilityTerms: ["context management"],
    intentType: "explore",
    queryType: "capability_search",
    requiredEntities: [],
    githubQueries: ["claude OR ai coding assistant"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCollections.mockResolvedValue({ collections: [{ name: "repos" }] });
  mockGetCollection.mockResolvedValue({
    config: {
      params: {
        vectors: { dense: { size: 1536, distance: "Cosine" } },
        sparse_vectors: { bm25: { modifier: "idf" } },
      },
    },
  });
  mockCreatePayloadIndex.mockResolvedValue({});
  mockQuery.mockResolvedValue({ points: [] });
  mockSearch.mockResolvedValue([]);
  mockGenerateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
  Object.assign(env, {
    QDRANT_DENSE_PROVIDER: "openai",
    QDRANT_DENSE_MODEL: "sentence-transformers/all-minilm-l6-v2",
    QDRANT_DENSE_VECTOR_SIZE: 384,
  });
});

describe("searchVectors", () => {
  it("uses hybrid query with prefetch (dense + BM25) and RRF fusion", async () => {
    const parsed = makeParsed({ anchorTerms: [] });

    await searchVectors("context management", parsed, 8);

    expect(mockQuery).toHaveBeenCalledWith(
      "repos",
      expect.objectContaining({
        prefetch: expect.arrayContaining([
          expect.objectContaining({
            using: "bm25",
            limit: 20,
          }),
          expect.objectContaining({
            using: "dense",
            limit: 20,
          }),
        ]),
        query: expect.objectContaining({
          rrf: expect.objectContaining({
            weights: [1.0, 3.0],
          }),
        }),
        limit: 8,
        with_payload: true,
      }),
    );
  });

  it("passes BM25 text inference in prefetch", async () => {
    const parsed = makeParsed();

    await searchVectors("notebooklm python api", parsed, 8);

    const callArgs = mockQuery.mock.calls[0][1] as Record<string, unknown>;
    const prefetches = callArgs.prefetch as Array<Record<string, unknown>>;

    const sparsePrefetch = prefetches.find((p) => p.using === "bm25");
    expect(sparsePrefetch).toBeDefined();
    expect(sparsePrefetch!.query).toEqual(
      expect.objectContaining({
        text: "notebooklm python api",
        model: "qdrant/bm25",
      }),
    );
  });

  it("uses Qdrant-native dense inference when the experiment flag is enabled", async () => {
    Object.assign(env, {
      QDRANT_DENSE_PROVIDER: "qdrant",
      QDRANT_DENSE_MODEL: "sentence-transformers/all-minilm-l6-v2",
      QDRANT_DENSE_VECTOR_SIZE: 384,
    });

    await searchVectors("notebooklm python api", makeParsed(), 8);

    const callArgs = mockQuery.mock.calls[0][1] as Record<string, unknown>;
    const prefetches = callArgs.prefetch as Array<Record<string, unknown>>;
    const densePrefetch = prefetches.find((prefetch) => prefetch.using === "dense");

    expect(densePrefetch).toEqual(
      expect.objectContaining({
        query: {
          text: "notebooklm python api",
          model: "sentence-transformers/all-minilm-l6-v2",
        },
      }),
    );
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  it("returns empty array when Qdrant returns no results", async () => {
    mockQuery.mockResolvedValue({ points: [] });
    const parsed = makeParsed();

    const result = await searchVectors("nonexistent query", parsed, 5);

    expect(result).toEqual([]);
  });

  it("maps Qdrant results to RepoDoc with source=vector", async () => {
    mockQuery.mockResolvedValue({
      points: [
        {
          score: 0.92,
          payload: {
            slug: "anthropics/claude-code",
            name: "Claude Code",
            description: "AI coding assistant",
            capabilities: ["code-generation", "context-management"],
            primitives: ["llm-calls"],
            stars: 5000,
            language: "TypeScript",
            topics: ["claude", "ai", "coding"],
          },
        },
      ],
    });

    const parsed = makeParsed({ anchorTerms: ["claude"] });
    const result = await searchVectors("claude code", parsed, 8);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      slug: "anthropics/claude-code",
      name: "Claude Code",
      score: 0.92,
      source: "vector",
      readme: "",
      capabilities: ["code-generation", "context-management"],
    });
  });

  it("handles results with missing payload fields", async () => {
    mockQuery.mockResolvedValue({
      points: [
        { score: 0.5, payload: {} },
        { score: 0.4, payload: { slug: "partial/repo" } },
      ],
    });

    const parsed = makeParsed();
    const result = await searchVectors("vague", parsed, 5);

    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe("");
    expect(result[0].name).toBe("");
    expect(result[0].language).toBeNull();
    expect(result[0].stars).toBe(0);
    expect(result[0].topics).toEqual([]);
    expect(result[0].capabilities).toEqual([]);
    expect(result[1].slug).toBe("partial/repo");
    expect(result[1].url).toBe("https://github.com/partial/repo");
  });

  it("falls back to dense-only search when hybrid query fails", async () => {
    mockQuery
      .mockRejectedValueOnce(new Error("BM25 not supported"))
      .mockResolvedValueOnce({
        points: [
          {
            score: 0.85,
            payload: {
              slug: "fallback/repo",
              name: "Fallback Repo",
              description: "Dense only",
              capabilities: [],
              primitives: [],
              stars: 100,
              language: "Python",
              topics: [],
            },
          },
        ],
      });

    const parsed = makeParsed();
    const result = await searchVectors("fallback test", parsed, 5);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("fallback/repo");
  });

  it("adds anchor-based filter during dense fallback when anchor terms exist", async () => {
    mockQuery
      .mockRejectedValueOnce(new Error("BM25 not supported"))
      .mockResolvedValueOnce({ points: [] });

    await searchVectors("claude code", makeParsed({ anchorTerms: ["Claude", "assistant"] }), 5);

    expect(mockQuery).toHaveBeenLastCalledWith(
      "repos",
      expect.objectContaining({
        query: expect.anything(),
        using: "dense",
        filter: {
          should: [
            { key: "slug", match: { value: "claude" } },
            { key: "topics", match: { value: "claude" } },
            { key: "slug", match: { value: "assistant" } },
            { key: "topics", match: { value: "assistant" } },
          ],
        },
      }),
    );
  });
});
