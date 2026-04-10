import { NextRequest } from "next/server";
import { db, events } from "@/db";
import type { EventInput } from "@/core/types";

export const SESSION_HEADER = "x-categoryforge-session";

export function getSessionId(req: NextRequest) {
  return req.headers.get(SESSION_HEADER)?.trim() || null;
}

function normalizeEvent(sessionId: string, event: EventInput) {
  return {
    sessionId,
    eventType: event.type,
    queryText: event.queryText?.trim() || null,
    repoSlug: event.repoSlug?.trim() || null,
    comboId: event.comboId ?? null,
    page: event.page?.trim() || null,
    source: event.source?.trim() || null,
    payload: event.payload ?? {},
  };
}

export async function trackEvents(sessionId: string, batch: EventInput[]) {
  if (batch.length === 0) {
    return 0;
  }

  await db.insert(events).values(batch.map((event) => normalizeEvent(sessionId, event)));
  return batch.length;
}

export async function trackEvent(sessionId: string, event: EventInput) {
  return trackEvents(sessionId, [event]);
}
