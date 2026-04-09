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

const QUERY_PARSE_SYSTEM = `You rewrite user product queries into structured search intents.

Extract:
- anchor_terms: Named entities like brand/product/library names (e.g. "notebooklm", "next.js", "prisma").
- capability_terms: Functional abilities the user wants (e.g. "python api", "authentication", "orm").
- intent_type: explore (browsing), build (wants to make something), lookup (specific repo/tool lookup).
- query_type:
    * specific_tool: User names a specific tool or library (e.g. "notebookLM python api", "supabase client").
    * capability_search: User describes what they want to do without naming a specific tool (e.g. "auth library for react").
    * comparison: User compares tools (e.g. "prisma vs drizzle").
    * alternative: User seeks an alternative (e.g. "alternative to next.js").
    * tutorial: User wants a guide/tutorial (e.g. "how to build a chatbot with langchain").
- required_entities: Exact names that MUST appear in results. These are the anchor_terms that are actual product/library names, not generic words. For example, in "python api for notebookLM", required_entities = ["notebooklm"].
- github_queries: 2-3 rewritten GitHub search queries. Strategy varies by query_type:
    * specific_tool: Include the exact entity name + "in:name,description,readme" qualifier. Also include a synonym/broader variant.
    * capability_search: Use synonyms and broader terms. Include relevant qualifiers like "language:python" if inferred.
    * comparison: One query per compared tool.
    * alternative: Include the tool name + common alternatives via OR.
    * tutorial: Include "example", "demo", "starter" keywords.
  CRITICAL: Each github_query MUST contain at most 5 AND/OR/NOT operators combined. GitHub Search API rejects queries with more than 5.`;

export async function parseQuery(query: string): Promise<ParsedQuery> {
  try {
    const { object } = await generateObject({
      model: openai(env.OPENAI_MODEL),
      schema: queryParseSchema,
      system: QUERY_PARSE_SYSTEM,
      prompt: `Query: "${query}"`,
    });
    return {
      text: query,
      anchorTerms: object.anchor_terms,
      capabilityTerms: object.capability_terms,
      intentType: object.intent_type,
      queryType: object.query_type,
      requiredEntities: object.required_entities,
      githubQueries: object.github_queries,
    };
  } catch (e) {
    logger.warn({ err: e, query }, "Query parse failed, using fallback");
    return {
      text: query,
      anchorTerms: query.split(/\s+/).filter((w) => w.length > 3),
      capabilityTerms: [],
      intentType: "explore",
      queryType: "capability_search",
      requiredEntities: [],
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
and score 0-1 on novelty, composable_fit, accessibility_wedge, time_to_demo, category_upside, narrative_clarity.
Scoring rubric:
- novelty: 0 = obvious clone, 1 = surprising but credible combination.
- composable_fit: 0 = weak integration, 1 = parts clearly strengthen each other.
- accessibility_wedge: 0 = no clear adoption wedge, 1 = obvious niche/user wedge.
- time_to_demo: 0 = weeks of custom infra, 1 = demoable in a weekend.
- category_upside: 0 = tiny outcome, 1 = strong platform or startup upside.
- narrative_clarity: 0 = confusing pitch, 1 = immediately understandable.
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
