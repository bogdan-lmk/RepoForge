import { NextRequest, NextResponse } from "next/server";
import { ingestTrending } from "@/services/ingest";
import { logger } from "@/lib/logger";
import { env } from "@/env";
import {
  enforceRateLimit,
  requireBearerSecret,
} from "@/core/route-guards";

export async function POST(req: NextRequest) {
  const authError = requireBearerSecret(req, env.INGEST_SECRET, "ingest");
  if (authError) {
    return authError;
  }

  const rateLimitError = enforceRateLimit(req, {
    bucket: "ingest",
    limit: 2,
    windowMs: 60_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const result = await ingestTrending();
    return NextResponse.json({ data: result });
  } catch (e) {
    logger.error({ err: e }, "Ingest failed");
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}
