import { NextRequest } from "next/server";
import { db, combos } from "@/db";
import { eq } from "drizzle-orm";
import { apiResponse, apiError } from "@/core/api-helpers";
import { logger } from "@/lib/logger";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const numericId = Number(id);
    if (Number.isNaN(numericId)) {
      return apiError("Invalid combo id", 400);
    }

    const rows = await db
      .select({ saved: combos.saved })
      .from(combos)
      .where(eq(combos.id, numericId))
      .limit(1);

    if (!rows.length) {
      return apiError("Combo not found", 404);
    }

    const newSaved = !rows[0].saved;

    await db
      .update(combos)
      .set({ saved: newSaved })
      .where(eq(combos.id, numericId));

    return apiResponse({ id: numericId, saved: newSaved });
  } catch (e) {
    logger.error({ err: e }, "PATCH /api/combos/[id] failed");
    return apiError("Failed to toggle save", 500);
  }
}
