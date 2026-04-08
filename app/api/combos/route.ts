import { db, combos } from "@/db";
import { desc, eq } from "drizzle-orm";
import { apiResponse, apiError } from "@/core/api-helpers";
import { mapComboToApi } from "@/core/mappers";
import { logger } from "@/lib/logger";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const savedOnly = url.searchParams.get("saved") === "true";

    const query = db
      .select()
      .from(combos)
      .orderBy(desc(combos.createdAt))
      .limit(50);

    const rows = savedOnly
      ? await query.where(eq(combos.saved, true))
      : await query;

    return apiResponse(rows.map(mapComboToApi));
  } catch (e) {
    logger.error({ err: e }, "GET /api/combos failed");
    return apiError("Failed to fetch combos", 500);
  }
}
