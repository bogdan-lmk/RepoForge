import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  requireBearerSecret,
  resetRouteGuards,
} from "@/core/route-guards";

describe("route guards", () => {
  beforeEach(() => {
    resetRouteGuards();
  });

  it("rejects bearer auth when secret is not configured", async () => {
    const req = new NextRequest("http://localhost/api/ingest");

    const response = requireBearerSecret(req, undefined, "ingest");
    const body = await response?.json();

    expect(response?.status).toBe(503);
    expect(body).toEqual({ error: "ingest is not configured" });
  });

  it("rejects bearer auth when token is invalid", async () => {
    const req = new NextRequest("http://localhost/api/reindex", {
      headers: {
        authorization: "Bearer wrong",
      },
    });

    const response = requireBearerSecret(req, "secret", "reindex");
    const body = await response?.json();

    expect(response?.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("allows requests with valid bearer auth", () => {
    const req = new NextRequest("http://localhost/api/reindex", {
      headers: {
        authorization: "Bearer secret",
      },
    });

    expect(requireBearerSecret(req, "secret", "reindex")).toBeNull();
  });

  it("enforces a per-client rate limit", async () => {
    const req = new NextRequest("http://localhost/api/ideas/search", {
      headers: {
        "x-forwarded-for": "203.0.113.10",
      },
    });

    expect(
      enforceRateLimit(req, {
        bucket: "ideas-search",
        limit: 2,
        windowMs: 60_000,
      }),
    ).toBeNull();

    expect(
      enforceRateLimit(req, {
        bucket: "ideas-search",
        limit: 2,
        windowMs: 60_000,
      }),
    ).toBeNull();

    const response = enforceRateLimit(req, {
      bucket: "ideas-search",
      limit: 2,
      windowMs: 60_000,
    });
    const body = await response?.json();

    expect(response?.status).toBe(429);
    expect(body).toEqual({ error: "Too many requests" });
    expect(response?.headers.get("Retry-After")).toBe("60");
  });
});
