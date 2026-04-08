import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    QDRANT_URL: z.string().url(),
    OPENAI_API_KEY: z.string().min(1),
    OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
    OPENAI_MODEL: z.string().default("gpt-4o"),
    OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
    GITHUB_TOKEN: z.string().optional(),
    LIBRARIES_IO_API_KEY: z.string().optional(),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    QDRANT_URL: process.env.QDRANT_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    LIBRARIES_IO_API_KEY: process.env.LIBRARIES_IO_API_KEY,
  },
});
