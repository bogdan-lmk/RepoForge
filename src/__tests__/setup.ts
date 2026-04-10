import { vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    QDRANT_URL: "http://localhost:6333",
    QDRANT_API_KEY: undefined,
    QDRANT_DENSE_PROVIDER: "openai",
    QDRANT_DENSE_MODEL: "sentence-transformers/all-minilm-l6-v2",
    QDRANT_DENSE_VECTOR_SIZE: 384,
    OPENAI_API_KEY: "test-key",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    OPENAI_MODEL: "gpt-4o",
    OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
    GITHUB_TOKEN: undefined,
    LIBRARIES_IO_API_KEY: undefined,
    INGEST_SECRET: undefined,
    REINDEX_SECRET: undefined,
  },
}));
