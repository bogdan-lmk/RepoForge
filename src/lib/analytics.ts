"use client";

import type { EventInput } from "@/core/types";

const STORAGE_KEY = "category-forge-session-id";
const MAX_BATCH_SIZE = 20;
const MAX_QUEUE_SIZE = 100;
const FLUSH_DELAY_MS = 1_000;

let queue: EventInput[] = [];
let flushTimer: number | null = null;
let isFlushing = false;

export function getOrCreateSessionId() {
  if (typeof window === "undefined") {
    return null;
  }

  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, next);
  return next;
}

function scheduleFlush() {
  if (flushTimer || typeof window === "undefined") {
    return;
  }

  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushEvents();
  }, FLUSH_DELAY_MS);
}

export function enqueueEvent(event: EventInput) {
  if (typeof window === "undefined") {
    return;
  }

  queue.push({
    ...event,
    payload: event.payload ?? {},
  });

  if (queue.length > MAX_QUEUE_SIZE) {
    queue = queue.slice(queue.length - MAX_QUEUE_SIZE);
  }

  if (queue.length >= MAX_BATCH_SIZE) {
    void flushEvents();
    return;
  }

  scheduleFlush();
}

export async function flushEvents() {
  if (typeof window === "undefined" || isFlushing || queue.length === 0) {
    return;
  }

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const sessionId = getOrCreateSessionId();
  if (!sessionId) {
    return;
  }

  isFlushing = true;
  const batch = queue.slice(0, MAX_BATCH_SIZE);
  queue = queue.slice(MAX_BATCH_SIZE);

  try {
    const response = await fetch("/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-categoryforge-session": sessionId,
      },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });

    if (!response.ok) {
      throw new Error(`Event flush failed with ${response.status}`);
    }
  } catch {
    queue = [...batch, ...queue].slice(0, MAX_QUEUE_SIZE);
  } finally {
    isFlushing = false;
    if (queue.length > 0) {
      scheduleFlush();
    }
  }
}
