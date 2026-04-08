import { logger } from "@/lib/logger";
import type { TrendingRepo } from "@/core/types";

export async function fetchTrending(limit = 25): Promise<TrendingRepo[]> {
  const res = await fetch(
    "https://api.ossinsight.io/v1/trends/repos/?period=past_24_hours&language=All",
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) },
  );
  if (!res.ok) {
    logger.warn({ status: res.status }, "OSSInsight fetch failed");
    return [];
  }
  const payload = await res.json();
  const rows = payload?.data?.rows;
  if (!Array.isArray(rows)) return [];

  return rows.slice(0, limit).map((r: Record<string, unknown>) => ({
    slug: String(r.repo_name ?? ""),
    name: String(r.repo_name ?? "").split("/").pop() ?? "",
    stars: toInt(r.stars),
    trendScore: toFloat(r.total_score),
  }));
}

function toInt(v: unknown): number {
  if (v == null || v === "") return 0;
  return Number(v) | 0;
}

function toFloat(v: unknown): number {
  if (v == null || v === "") return 0;
  return Number(v) || 0;
}
