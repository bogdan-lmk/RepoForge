import { NextRequest } from "next/server";
import { apiResponse } from "@/core/api-helpers";
import { getFeaturedCombos } from "@/lib/featured-combos";

function normalizeLimit(value: string | null) {
  const parsed = Number(value ?? 3);
  if (!Number.isFinite(parsed)) {
    return 3;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), 6);
}

export async function GET(req: NextRequest) {
  const limit = normalizeLimit(req.nextUrl.searchParams.get("limit"));
  return apiResponse(await getFeaturedCombos(limit));
}
