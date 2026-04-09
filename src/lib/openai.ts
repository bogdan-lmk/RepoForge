import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, embed } from "ai";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import {
  comboDraftListSchema,
  capabilityExtractionSchema,
  queryParseSchema,
} from "@/core/schemas";
import type { ParsedQuery, RepoDoc } from "@/core/types";

const openai = createOpenAI({
  apiKey: env.OPENAI_API_KEY,
  baseURL: env.OPENAI_BASE_URL,
});

export async function parseQuery(query: string): Promise<ParsedQuery> {
  try {
    const { object } = await generateObject({
      model: openai(env.OPENAI_MODEL),
      schema: queryParseSchema,
      system: `You rewrite user product queries into structured search intents.
Return anchor_terms (named entities like brand/product names), capability_terms (verbs/abilities the user wants),
intent_type (explore = browsing, build = wants to make something, lookup = specific repo lookup),
and github_queries (2-3 rewritten GitHub search queries using OR, synonyms, broader terms).
CRITICAL: Each github_query MUST contain at most 5 AND/OR/NOT operators combined. GitHub Search API rejects queries with more than 5. Use simpler, focused queries instead of complex boolean expressions.`,
      prompt: `Query: "${query}"`,
    });
    return {
      text: query,
      anchorTerms: object.anchor_terms,
      capabilityTerms: object.capability_terms,
      intentType: object.intent_type,
      githubQueries: object.github_queries,
    };
  } catch (e) {
    logger.warn({ err: e, query }, "Query parse failed, using fallback");
    return {
      text: query,
      anchorTerms: query.split(/\s+/).filter((w) => w.length > 3),
      capabilityTerms: [],
      intentType: "explore",
      githubQueries: [query],
    };
  }
}

export async function generateCombos(
  repos: RepoDoc[],
  query: string,
  limit = 3,
) {
  const repoSummaries = repos
    .slice(0, 10)
    .map((r) => {
      const caps = r.capabilities.length
        ? `\n  capabilities: ${r.capabilities.slice(0, 5).join("; ")}`
        : "";
      return `- ${r.slug}: ${r.description}${caps}`;
    })
    .join("\n");

  try {
    const { object } = await generateObject({
      model: openai(env.OPENAI_MODEL),
      schema: comboDraftListSchema,
      system: `You combine open-source repos into concrete product ideas.
Each combo must: have a clear thesis (one sentence why this mix creates value),
specify repo_roles (anchor/enabling/amplification per repo), include a 72h demo plan,
and score 0-1 on novelty, composable_fit, narrative_clarity.
Generate exactly ${limit} combos. Be specific and actionable.`,
      prompt: `Query: "${query}"\n\nAvailable repos:\n${repoSummaries}`,
    });
    return object.combos;
  } catch (e) {
    logger.error({ err: e, query }, "Combo generation failed");
    return [];
  }
}

export async function extractCapabilities(
  repo: RepoDoc,
): Promise<{ capabilities: string[]; primitives: string[] }> {
  const text = `${repo.description}\n\n${repo.readme?.slice(0, 4000) ?? ""}`;
  if (text.trim().length < 50) {
    return { capabilities: [], primitives: [] };
  }

  try {
    const { object } = await generateObject({
      model: openai(env.OPENAI_MODEL),
      schema: capabilityExtractionSchema,
      system: `Extract technical capabilities and primitives from a GitHub repo.
Capabilities = human-readable abilities (e.g. "copy-trade a target trader").
Primitives = low-level technical atoms (e.g. "poll API periodically").
Return max 8 capabilities and 12 primitives.`,
      prompt: `Repo: ${repo.slug}\n${text}`,
    });
    return object;
  } catch (e) {
    logger.warn({ err: e, slug: repo.slug }, "Capability extraction failed");
    return { capabilities: [], primitives: [] };
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding(env.OPENAI_EMBEDDING_MODEL),
    value: text.slice(0, 2000),
  });
  return embedding;
}
