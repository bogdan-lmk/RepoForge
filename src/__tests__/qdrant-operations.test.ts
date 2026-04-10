import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "@/env";

const {
  mockSearch,
  mockQuery,
  mockGetCollections,
  mockGetCollection,
  mockCreateCollection,
  mockCreatePayloadIndex,
  mockUpsert,
  mockDeleteCollection,
  mockGenerateEmbedding,
  mockSelect,
  mockFrom,
} = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockQuery: vi.fn(),
  mockGetCollections: vi.fn(),
  mockGetCollection: vi.fn(),
  mockCreateCollection: vi.fn(),
  mockCreatePayloadIndex: vi.fn(),
  mockUpsert: vi.fn(),
  mockDeleteCollection: vi.fn().mockResolvedValue(undefined),
  mockGenerateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
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
    this.search = mockSearch;
    this.query = mockQuery;
    this.upsert = mockUpsert;
    this.deleteCollection = mockDeleteCollection;
  }),
}));

vi.mock("@/lib/openai", () => ({
  generateEmbedding: mockGenerateEmbedding,
}));

vi.mock("@/db", async () => {
  const schema = await vi.importActual<typeof import("@/db/schema")>("@/db/schema");
  return {
    ...schema,
    db: {
      select: mockSelect,
    },
  };
});

import { upsertVectors, reindexAll, _resetCollectionReady } from "@/lib/qdrant";
import type { RepoDoc } from "@/core/types";

function makeRepo(slug: string): RepoDoc {
  return {
    slug,
    name: slug.split("/")[1] ?? slug,
    url: `https://github.com/${slug}`,
    description: `Description of ${slug}`,
    readme: "# " + slug,
    language: "TypeScript",
    topics: ["test"],
    stars: 50,
    capabilities: ["does-stuff"],
    primitives: ["primitive-a"],
  };
}

beforeEach(() => {
  _resetCollectionReady();
  vi.clearAllMocks();
  mockGetCollections.mockResolvedValue({ collections: [] });
  mockGetCollection.mockResolvedValue({
    config: {
      params: {
        vectors: { dense: { size: 1536, distance: "Cosine" } },
        sparse_vectors: { bm25: { modifier: "idf" } },
      },
    },
  });
  mockCreateCollection.mockResolvedValue({});
  mockCreatePayloadIndex.mockResolvedValue({});
  mockUpsert.mockResolvedValue({ status: "ok" });
  mockGenerateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockResolvedValue([]);
  Object.assign(env, {
    QDRANT_DENSE_PROVIDER: "openai",
    QDRANT_DENSE_MODEL: "sentence-transformers/all-minilm-l6-v2",
    QDRANT_DENSE_VECTOR_SIZE: 384,
  });
});

describe("ensureCollection", () => {
  it("creates collection when it does not exist", async () => {
    mockGetCollections.mockResolvedValue({ collections: [] });
    mockCreateCollection.mockResolvedValue({});

    await upsertVectors([makeRepo("test/repo")]);

    expect(mockCreateCollection).toHaveBeenCalledWith("repos", {
      vectors: { dense: { size: 1536, distance: "Cosine" } },
      sparse_vectors: { bm25: { modifier: "idf" } },
    });
  });

  it("creates collection with Qdrant dense vector size when the experiment is enabled", async () => {
    Object.assign(env, {
      QDRANT_DENSE_PROVIDER: "qdrant",
      QDRANT_DENSE_VECTOR_SIZE: 384,
    });

    await upsertVectors([makeRepo("test/repo")]);

    expect(mockCreateCollection).toHaveBeenCalledWith("repos", {
      vectors: { dense: { size: 384, distance: "Cosine" } },
      sparse_vectors: { bm25: { modifier: "idf" } },
    });
  });

  it("creates payload indexes on existing collection", async () => {
    mockGetCollections.mockResolvedValue({ collections: [{ name: "repos" }] });
    await upsertVectors([makeRepo("test/repo")]);

    expect(mockCreatePayloadIndex).toHaveBeenCalledTimes(3);
  });

  it("rebuilds a legacy dense-only collection from PostgreSQL", async () => {
    mockGetCollections.mockResolvedValue({ collections: [{ name: "repos" }] });
    mockGetCollection.mockResolvedValue({
      config: {
        params: {
          vectors: { size: 1536, distance: "Cosine" },
        },
      },
    });
    mockFrom.mockResolvedValue([{
      slug: "legacy/repo",
      name: "repo",
      url: "https://github.com/legacy/repo",
      description: "Legacy repo",
      readme: "# repo",
      language: "TypeScript",
      topics: ["legacy"],
      stars: 10,
      capabilities: ["search"],
      primitives: ["bm25"],
    }]);

    await upsertVectors([makeRepo("test/repo")]);

    expect(mockDeleteCollection).toHaveBeenCalledWith("repos");
    expect(mockCreateCollection).toHaveBeenCalledWith("repos", {
      vectors: { dense: { size: 1536, distance: "Cosine" } },
      sparse_vectors: { bm25: { modifier: "idf" } },
    });
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it("rebuilds legacy collection even when deleteCollection reports not found", async () => {
    mockGetCollections.mockResolvedValue({ collections: [{ name: "repos" }] });
    mockGetCollection.mockResolvedValue({
      config: {
        params: {
          vectors: { size: 1536, distance: "Cosine" },
        },
      },
    });
    mockDeleteCollection.mockRejectedValueOnce(new Error("Not found"));
    mockFrom.mockResolvedValue([{
      slug: "legacy/repo",
      name: "repo",
      url: "https://github.com/legacy/repo",
      description: "Legacy repo",
      readme: "# repo",
      language: "TypeScript",
      topics: ["legacy"],
      stars: 10,
      capabilities: ["search"],
      primitives: ["bm25"],
    }]);

    await upsertVectors([makeRepo("test/repo")]);

    expect(mockCreateCollection).toHaveBeenCalledWith("repos", {
      vectors: { dense: { size: 1536, distance: "Cosine" } },
      sparse_vectors: { bm25: { modifier: "idf" } },
    });
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it("rebuilds collection when dense size does not match the active experiment", async () => {
    Object.assign(env, {
      QDRANT_DENSE_PROVIDER: "qdrant",
      QDRANT_DENSE_VECTOR_SIZE: 384,
    });
    mockGetCollections.mockResolvedValue({ collections: [{ name: "repos" }] });
    mockGetCollection.mockResolvedValue({
      config: {
        params: {
          vectors: { dense: { size: 1536, distance: "Cosine" } },
          sparse_vectors: { bm25: { modifier: "idf" } },
        },
      },
    });
    mockFrom.mockResolvedValue([{
      slug: "legacy/repo",
      name: "repo",
      url: "https://github.com/legacy/repo",
      description: "Legacy repo",
      readme: "# repo",
      language: "TypeScript",
      topics: ["legacy"],
      stars: 10,
      capabilities: ["search"],
      primitives: ["bm25"],
    }]);

    await upsertVectors([makeRepo("test/repo")]);

    expect(mockDeleteCollection).toHaveBeenCalledWith("repos");
    expect(mockCreateCollection).toHaveBeenCalledWith("repos", {
      vectors: { dense: { size: 384, distance: "Cosine" } },
      sparse_vectors: { bm25: { modifier: "idf" } },
    });
  });
});

describe("upsertVectors", () => {
  it("generates embedding and upserts points for each repo", async () => {
    const repos = [makeRepo("foo/bar"), makeRepo("baz/qux")];

    await upsertVectors(repos);

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const callArgs = mockUpsert.mock.calls[0][1] as { points: unknown[] };
    expect(callArgs.points).toHaveLength(2);
  });

  it("skips repos where embedding fails", async () => {
    mockGenerateEmbedding
      .mockResolvedValueOnce(new Array(1536).fill(0.1))
      .mockRejectedValueOnce(new Error("API error"));

    const repos = [makeRepo("foo/bar"), makeRepo("baz/qux")];

    await upsertVectors(repos);

    const callArgs = mockUpsert.mock.calls[0][1] as { points: unknown[] };
    expect(callArgs.points).toHaveLength(1);
  });

  it("does nothing for empty input", async () => {
    await upsertVectors([]);

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("does not call upsert when all embeddings fail", async () => {
    mockGenerateEmbedding.mockRejectedValue(new Error("API down"));

    const repos = [makeRepo("fail/one"), makeRepo("fail/two")];

    await upsertVectors(repos);

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("stores expected payload fields", async () => {
    const repo = makeRepo("test/payload-check");
    repo.capabilities = ["cap-a", "cap-b"];
    repo.primitives = ["prim-a"];
    repo.topics = ["topic-a"];
    repo.stars = 42;
    repo.language = "Rust";

    await upsertVectors([repo]);

    const callArgs = mockUpsert.mock.calls[0][1] as {
      points: Array<{ payload: Record<string, unknown> }>;
    };
    const payload = callArgs.points[0].payload;
    expect(payload).toMatchObject({
      slug: "test/payload-check",
      capabilities: ["cap-a", "cap-b"],
      primitives: ["prim-a"],
      topics: ["topic-a"],
      stars: 42,
      language: "Rust",
    });
    expect(payload).not.toHaveProperty("readme");
  });

  it("uses Qdrant-native dense inference objects when the experiment is enabled", async () => {
    Object.assign(env, {
      QDRANT_DENSE_PROVIDER: "qdrant",
      QDRANT_DENSE_MODEL: "sentence-transformers/all-minilm-l6-v2",
      QDRANT_DENSE_VECTOR_SIZE: 384,
    });

    await upsertVectors([makeRepo("test/qdrant-dense")]);

    const callArgs = mockUpsert.mock.calls[0][1] as {
      points: Array<{ vector: Record<string, unknown> }>;
    };
    const vector = callArgs.points[0].vector;

    expect(vector).toMatchObject({
      dense: {
        text: expect.stringContaining("test/qdrant-dense"),
        model: "sentence-transformers/all-minilm-l6-v2",
      },
      bm25: {
        text: expect.stringContaining("test/qdrant-dense"),
        model: "qdrant/bm25",
      },
    });
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  it("generates valid UUID point IDs (not truncated hex)", async () => {
    await upsertVectors([makeRepo("test/uuid-check")]);

    const callArgs = mockUpsert.mock.calls[0][1] as {
      points: Array<{ id: string }>;
    };
    const id = callArgs.points[0].id;
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(id).toMatch(uuidRegex);
  });

  it("generates deterministic IDs (same slug → same UUID)", async () => {
    await upsertVectors([makeRepo("foo/deterministic")]);

    const call1 = mockUpsert.mock.calls[0][1] as {
      points: Array<{ id: string }>;
    };
    const id1 = call1.points[0].id;

    mockUpsert.mockClear();
    await upsertVectors([makeRepo("foo/deterministic")]);

    const call2 = mockUpsert.mock.calls[0][1] as {
      points: Array<{ id: string }>;
    };
    const id2 = call2.points[0].id;

    expect(id1).toBe(id2);
  });
});

describe("reindexAll", () => {
  it("deletes and recreates collection, then batch upserts", async () => {
    const repos = Array.from({ length: 5 }, (_, i) => makeRepo(`test/repo-${i}`));
    mockGetCollections
      .mockResolvedValueOnce({ collections: [] })
      .mockResolvedValue({ collections: [{ name: "repos" }] });

    await reindexAll(repos);

    expect(mockDeleteCollection).toHaveBeenCalledWith("repos");
    expect(mockUpsert).toHaveBeenCalled();
  });

  it("handles deleteCollection failure gracefully", async () => {
    mockDeleteCollection.mockRejectedValueOnce(new Error("Not found"));
    mockGetCollections.mockResolvedValue({ collections: [{ name: "repos" }] });

    const repos = [makeRepo("test/survives")];
    await reindexAll(repos);

    expect(mockUpsert).toHaveBeenCalled();
  });
});
