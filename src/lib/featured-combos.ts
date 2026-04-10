import { desc, eq } from "drizzle-orm";
import { db, combos } from "@/db";
import { mapComboToApi } from "@/core/mappers";
import type { ComboIdea } from "@/core/types";
import { logger } from "@/lib/logger";

export async function getFeaturedCombos(limit = 3): Promise<ComboIdea[]> {
  try {
    const rows = await db
      .select()
      .from(combos)
      .where(eq(combos.isFeatured, true))
      .orderBy(desc(combos.createdAt))
      .limit(limit);

    return rows.map(mapComboToApi);
  } catch (error) {
    logger.error({ err: error }, "Failed to load featured combos");
    return [];
  }
}
