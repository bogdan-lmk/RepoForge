import { NextRequest, NextResponse } from "next/server";

type RateLimitOptions = {
  bucket: string;
  limit: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

function jsonError(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

export function getClientIdentifier(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return req.headers.get("x-real-ip") ?? "unknown";
}

export function requireBearerSecret(
  req: NextRequest,
  secret: string | undefined,
  endpointName: string,
) {
  if (!secret) {
    return jsonError(`${endpointName} is not configured`, 503);
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return jsonError("Unauthorized", 401);
  }

  return null;
}

export function enforceRateLimit(
  req: NextRequest,
  options: RateLimitOptions,
) {
  const now = Date.now();
  const key = `${options.bucket}:${getClientIdentifier(req)}`;
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return null;
  }

  if (current.count >= options.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((current.resetAt - now) / 1000),
    );

    return jsonError("Too many requests", 429, {
      "Retry-After": String(retryAfterSeconds),
    });
  }

  rateLimitStore.set(key, {
    count: current.count + 1,
    resetAt: current.resetAt,
  });

  return null;
}

export function resetRouteGuards() {
  rateLimitStore.clear();
}
