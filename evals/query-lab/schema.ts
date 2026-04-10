import { z } from "zod";

export const evalQuerySchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  query_type: z.enum([
    "specific_tool",
    "capability_search",
    "exploration",
    "alternative",
    "comparison",
    "trend_discovery",
  ]),
  must_have: z.array(z.string()).default([]),
  good_candidates: z.array(z.string()).default([]),
  bad_candidates: z.array(z.string()).default([]),
  notes: z.string().default(""),
});

export type EvalQuery = z.infer<typeof evalQuerySchema>;
