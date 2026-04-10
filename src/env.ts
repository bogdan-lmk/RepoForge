import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    QDRANT_URL: z.string().url(),
    QDRANT_API_KEY: z.string().optional(),
    QDRANT_DENSE_PROVIDER: z.enum(["openai", "qdrant"]).default("openai"),
    QDRANT_DENSE_MODEL: z.string().default("sentence-transformers/all-minilm-l6-v2"),
    QDRANT_DENSE_VECTOR_SIZE: z.coerce.number().int().positive().default(384),
    OPENAI_API_KEY: z.string().min(1),
    OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
    OPENAI_MODEL: z.string().default("gpt-4o"),
    OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
    GITHUB_TOKEN: z.string().optional(),
    LIBRARIES_IO_API_KEY: z.string().optional(),
    INGEST_SECRET: z.string().optional(),
    REINDEX_SECRET: z.string().optional(),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    QDRANT_URL: process.env.QDRANT_URL,
    QDRANT_API_KEY: process.env.QDRANT_API_KEY,
    QDRANT_DENSE_PROVIDER: process.env.QDRANT_DENSE_PROVIDER,
    QDRANT_DENSE_MODEL: process.env.QDRANT_DENSE_MODEL,
    QDRANT_DENSE_VECTOR_SIZE: process.env.QDRANT_DENSE_VECTOR_SIZE,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    LIBRARIES_IO_API_KEY: process.env.LIBRARIES_IO_API_KEY,
    INGEST_SECRET: process.env.INGEST_SECRET,
    REINDEX_SECRET: process.env.REINDEX_SECRET,
  },
});
