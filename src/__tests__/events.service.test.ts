import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInsert, mockValues } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/db", async () => {
  const schema = await vi.importActual<typeof import("@/db/schema")>("@/db/schema");

  mockInsert.mockReturnValue({
    values: mockValues,
  });

  return {
    ...schema,
    db: {
      insert: mockInsert,
    },
  };
});

import { trackEvent, trackEvents } from "@/services/events";

describe("events service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
  });

  it("writes a normalized batch of events", async () => {
    const inserted = await trackEvents("session-123", [
      {
        type: "search_started",
        queryText: "rag chatbot",
        page: "home",
        source: "hero-searchbar",
      },
      {
        type: "combo_saved",
        comboId: 42,
        payload: { title: "AI billing copilot" },
      },
    ]);

    expect(inserted).toBe(2);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith([
      {
        sessionId: "session-123",
        eventType: "search_started",
        queryText: "rag chatbot",
        repoSlug: null,
        comboId: null,
        page: "home",
        source: "hero-searchbar",
        payload: {},
      },
      {
        sessionId: "session-123",
        eventType: "combo_saved",
        queryText: null,
        repoSlug: null,
        comboId: 42,
        page: null,
        source: null,
        payload: { title: "AI billing copilot" },
      },
    ]);
  });

  it("supports inserting a single event through trackEvent", async () => {
    const inserted = await trackEvent("session-abc", {
      type: "repo_opened",
      repoSlug: "vercel/next.js",
      queryText: "next.js framework",
    });

    expect(inserted).toBe(1);
    expect(mockValues).toHaveBeenCalledWith([
      {
        sessionId: "session-abc",
        eventType: "repo_opened",
        queryText: "next.js framework",
        repoSlug: "vercel/next.js",
        comboId: null,
        page: null,
        source: null,
        payload: {},
      },
    ]);
  });

  it("normalizes combo save failure events with payload metadata", async () => {
    const inserted = await trackEvent("session-failure", {
      type: "combo_save_failed",
      comboId: 77,
      page: "home",
      source: "ideas-panel",
      payload: {
        title: "Agent Console",
        status: 500,
      },
    });

    expect(inserted).toBe(1);
    expect(mockValues).toHaveBeenCalledWith([
      {
        sessionId: "session-failure",
        eventType: "combo_save_failed",
        queryText: null,
        repoSlug: null,
        comboId: 77,
        page: "home",
        source: "ideas-panel",
        payload: {
          title: "Agent Console",
          status: 500,
        },
      },
    ]);
  });

  it("is a no-op for empty batches", async () => {
    const inserted = await trackEvents("session-empty", []);

    expect(inserted).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
