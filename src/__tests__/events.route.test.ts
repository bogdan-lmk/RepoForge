import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRouteGuards } from "@/core/route-guards";

const { mockTrackEvents } = vi.hoisted(() => ({
  mockTrackEvents: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/events", () => ({
  getSessionId: (req: NextRequest) => req.headers.get("x-categoryforge-session"),
  trackEvents: (...args: unknown[]) => mockTrackEvents(...args),
}));

import { POST } from "#/app/api/events/route";

describe("POST /api/events", () => {
  beforeEach(() => {
    resetRouteGuards();
    vi.clearAllMocks();
    mockTrackEvents.mockResolvedValue(1);
  });

  it("rejects requests without a session header", async () => {
    const req = new NextRequest("http://localhost/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        events: [{ type: "search_started", queryText: "rag" }],
      }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Missing session header" });
    expect(mockTrackEvents).not.toHaveBeenCalled();
  });

  it("validates the event payload", async () => {
    const req = new NextRequest("http://localhost/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-categoryforge-session": "session-123",
      },
      body: JSON.stringify({
        events: [{ type: "not-real" }],
      }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Invalid events payload" });
    expect(mockTrackEvents).not.toHaveBeenCalled();
  });

  it("accepts a valid batch and delegates to trackEvents", async () => {
    const req = new NextRequest("http://localhost/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-categoryforge-session": "session-123",
      },
      body: JSON.stringify({
        events: [
          {
            type: "search_started",
            queryText: "rag chatbot",
            page: "home",
            source: "hero-searchbar",
          },
        ],
      }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      data: {
        accepted: 1,
      },
    });
    expect(mockTrackEvents).toHaveBeenCalledWith("session-123", [
      {
        type: "search_started",
        queryText: "rag chatbot",
        page: "home",
        source: "hero-searchbar",
        payload: {},
      },
    ]);
  });
});
