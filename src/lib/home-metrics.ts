import { sql } from "drizzle-orm";
import { db, combos, repos, retrievalTraces } from "@/db";
import { logger } from "@/lib/logger";

export interface HomeMetrics {
  repoCount: number | null;
  comboCount: number | null;
  p50LatencyMs: number | null;
}

export async function getHomeMetrics(): Promise<HomeMetrics> {
  try {
    const [repoRows, comboRows, latencyRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(repos),
      db.select({ count: sql<number>`count(*)` }).from(combos),
      db
        .select({
          p50: sql<number | null>`percentile_cont(0.5) within group (order by ${retrievalTraces.latencyTotalMs})`,
        })
        .from(retrievalTraces)
        .where(sql`${retrievalTraces.latencyTotalMs} is not null`),
    ]);

    return {
      repoCount: toFiniteNumber(repoRows[0]?.count),
      comboCount: toFiniteNumber(comboRows[0]?.count),
      p50LatencyMs: toFiniteNumber(latencyRows[0]?.p50),
    };
  } catch (error) {
    logger.error({ err: error }, "Failed to load home metrics");
    return {
      repoCount: null,
      comboCount: null,
      p50LatencyMs: null,
    };
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;

  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
