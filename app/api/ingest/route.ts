import { NextResponse } from "next/server";
import { ingestTrending } from "@/services/ingest";
import { logger } from "@/lib/logger";

export async function POST() {
  try {
    const result = await ingestTrending();
    return NextResponse.json({ data: result });
  } catch (e) {
    logger.error({ err: e }, "Ingest failed");
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}
