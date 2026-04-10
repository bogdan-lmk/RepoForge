import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { apiError, apiResponse } from "@/core/api-helpers";
import { eventBatchSchema } from "@/core/schemas";
import { enforceRateLimit } from "@/core/route-guards";
import { getSessionId, trackEvents } from "@/services/events";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const rateLimitError = enforceRateLimit(req, {
    bucket: "events",
    limit: 60,
    windowMs: 60_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  const sessionId = getSessionId(req);
  if (!sessionId) {
    return apiError("Missing session header", 400);
  }

  try {
    const body = await req.json();
    const input = eventBatchSchema.parse(body);
    const accepted = await trackEvents(sessionId, input.events);
    return apiResponse({ accepted }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError("Invalid events payload", 400);
    }

    logger.error({ err: error }, "POST /api/events failed");
    return apiError("Failed to record events", 500);
  }
}
