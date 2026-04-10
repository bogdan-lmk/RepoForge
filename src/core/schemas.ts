import { z } from "zod";
import { EVENT_TYPES } from "@/core/types";

export const comboDraftSchema = z.object({
  title: z.string(),
  thesis: z.string(),
  formula: z.string().nullable(),
  repo_slugs: z.array(z.string()),
  repo_roles: z.array(z.object({ repo: z.string(), role: z.string() })).nullable(),
  steps: z.array(z.string()),
  recommended_shell: z.enum(["web", "telegram", "api", "cli", "extension"]).nullable(),
  what_is_being_combined: z.string().nullable(),
  capabilities: z.array(z.string()),
  supporting_primitives: z.array(z.string()),
  why_fit: z.string().nullable(),
  use_case: z.string().nullable(),
  why_better_than_single: z.string().nullable(),
  first_user: z.string().nullable(),
  demo_72h: z.string().nullable(),
  key_risks: z.array(z.string()),
  novelty: z.number().min(0).max(1).nullable(),
  composable_fit: z.number().min(0).max(1).nullable(),
  accessibility_wedge: z.number().min(0).max(1).nullable(),
  time_to_demo: z.number().min(0).max(1).nullable(),
  category_upside: z.number().min(0).max(1).nullable(),
  narrative_clarity: z.number().min(0).max(1).nullable(),
});

export const comboDraftListSchema = z.object({
  combos: z.array(comboDraftSchema),
});

export const capabilityExtractionSchema = z.object({
  capabilities: z.array(z.string()),
  primitives: z.array(z.string()),
});

export const queryParseSchema = z.object({
  anchor_terms: z.array(z.string()),
  capability_terms: z.array(z.string()),
  intent_type: z.enum(["explore", "build", "lookup"]),
  query_type: z.enum([
    "specific_tool",
    "capability_search",
    "comparison",
    "alternative",
    "tutorial",
  ]),
  required_entities: z.array(z.string()),
  github_queries: z.array(z.string()),
});

export const eventInputSchema = z.object({
  type: z.enum(EVENT_TYPES),
  queryText: z.string().trim().min(1).nullable().optional(),
  repoSlug: z.string().trim().min(1).nullable().optional(),
  comboId: z.number().int().positive().nullable().optional(),
  page: z.string().trim().min(1).nullable().optional(),
  source: z.string().trim().min(1).nullable().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const eventBatchSchema = z.object({
  events: z.array(eventInputSchema).min(1).max(20),
});

export type ComboDraft = z.infer<typeof comboDraftSchema>;
export type CapabilityExtraction = z.infer<typeof capabilityExtractionSchema>;
export type QueryParse = z.infer<typeof queryParseSchema>;
export type EventInputSchema = z.infer<typeof eventInputSchema>;
