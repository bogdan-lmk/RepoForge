import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ParsedQuery } from "@/core/types";

const { mockSearch, mockGetCollections, mockCreateCollection, mockCreatePayloadIndex } =
  vi.hoisted(() => ({
    mockSearch: vi.fn(),
    mockGetCollections: vi.fn(),
    mockCreateCollection: vi.fn(),
    mockCreatePayloadIndex: vi.fn(),
  }));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@qdrant/js-client-rest", () => ({
  QdrantClient: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.getCollections = mockGetCollections;
    this.createCollection = mockCreateCollection;
    this.createPayloadIndex = mockCreatePayloadIndex;
    this.search = mockSearch;
  }),
}));

vi.mock("@/lib/openai", () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

import { searchVectors } from "@/lib/qdrant";

function makeParsed(overrides: Partial<ParsedQuery> = {}): ParsedQuery {
  return {
    text: "claude code context management",
    anchorTerms: [],
    capabilityTerms: ["context management"],
    intentType: "explore",
    githubQueries: ["claude OR ai coding assistant"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCollections.mockResolvedValue({ collections: [{ name: "repos" }] });
  mockCreatePayloadIndex.mockResolvedValue({});
  mockSearch.mockResolvedValue([]);
});

describe("searchVectors", () => {
  it("calls search without filter when no anchor terms", async () => {
    const parsed = makeParsed({ anchorTerms: [] });

    await searchVectors("context management", parsed, 8);

    expect(mockSearch).toHaveBeenCalledWith(
      "repos",
      expect.objectContaining({
        vector: expect.any(Array),
        limit: 8,
        with_payload: true,
      }),
    );
    const callArgs = mockSearch.mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty("filter");
  });

  it("passes should filter with slug+topics for each anchor term", async () => {
    const parsed = makeParsed({ anchorTerms: ["claude", "supabase"] });

    await searchVectors("claude supabase context", parsed, 12);

    expect(mockSearch).toHaveBeenCalledWith(
      "repos",
      expect.objectContaining({
        filter: {
          should: [
            { key: "slug", match: { value: "claude" } },
            { key: "topics", match: { value: "claude" } },
            { key: "slug", match: { value: "supabase" } },
            { key: "topics", match: { value: "supabase" } },
          ],
        },
      }),
    );
  });

  it("returns empty array when Qdrant returns no results", async () => {
    mockSearch.mockResolvedValue([]);
    const parsed = makeParsed();

    const result = await searchVectors("nonexistent query", parsed, 5);

    expect(result).toEqual([]);
  });

  it("maps Qdrant results to RepoDoc with source=vector", async () => {
    mockSearch.mockResolvedValue([
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
    ]);

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
    mockSearch.mockResolvedValue([
      { score: 0.5, payload: {} },
      { score: 0.4, payload: { slug: "partial/repo" } },
    ]);

    const parsed = makeParsed();
    const result = await searchVectors("vague", parsed, 5);

    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe("");
    expect(result[0].name).toBe("");
    expect(result[0].language).toBeNull();
    expect(result[0].stars).toBe(0);
    expect(result[0].topics).toEqual([]);
    expect(result[0].capabilities).toEqual([]);
    expect(result[0].primitives).toEqual([]);
    expect(result[1].slug).toBe("partial/repo");
    expect(result[1].url).toBe("https://github.com/partial/repo");
  });
});
