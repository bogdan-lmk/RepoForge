/**
 * Hybrid vs Dense-Only comparison.
 *
 * Calls searchVectors() directly (not the full pipeline) to isolate the vector layer.
 * Runs each golden query in both modes and prints a comparison table.
 *
 * Usage:
 *   RUN_COMPARE=1 npx vitest run src/eval/compare-modes.test.ts
 *
 * Requires env vars: QDRANT_URL, OPENAI_API_KEY, DATABASE_URL
 *
 * Decision criterion:
 *   overlapAt5 < 0.6 on explore queries → hybrid produces meaningfully different results → keep it
 *   overlapAt5 consistently high         → dense-only may be sufficient and simpler
 */
import { describe, it, expect } from "vitest";
import { searchVectors } from "@/lib/qdrant";
import { parseQuery } from "@/lib/openai";
import { GOLDEN_QUERIES } from "./fixtures/golden-queries";

const RUN_COMPARE = process.env.RUN_COMPARE === "1";

interface ComparisonRow {
  query: string;
  intent: string;
  hybridTop5: string[];
  denseTop5: string[];
  hybridScore1: number;
  denseScore1: number;
  hybridScore5: number;
  denseScore5: number;
  overlapAt5: number;
}

function jaccardAt5(a: string[], b: string[]): number {
  const setA = new Set(a.slice(0, 5));
  const setB = new Set(b.slice(0, 5));
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

describe.skipIf(!RUN_COMPARE)("Vector Mode Comparison: hybrid vs dense-only", () => {
  const rows: ComparisonRow[] = [];

  for (const golden of GOLDEN_QUERIES) {
    it(`[${golden.expectedIntent}] "${golden.text}"`, async () => {
      const parsed = await parseQuery(golden.text);
      const enrichedQuery =
        [...parsed.anchorTerms, ...parsed.capabilityTerms].join(" ") || golden.text;

      const [hybridResults, denseResults] = await Promise.all([
        searchVectors(enrichedQuery, parsed, 5, "hybrid"),
        searchVectors(enrichedQuery, parsed, 5, "dense-only"),
      ]);

      const hybridTop5 = hybridResults.slice(0, 5).map((r) => r.slug);
      const denseTop5 = denseResults.slice(0, 5).map((r) => r.slug);
      const overlapAt5 = jaccardAt5(hybridTop5, denseTop5);

      rows.push({
        query: golden.text,
        intent: golden.expectedIntent,
        hybridTop5,
        denseTop5,
        hybridScore1: hybridResults[0]?.score ?? 0,
        denseScore1: denseResults[0]?.score ?? 0,
        hybridScore5: hybridResults[4]?.score ?? 0,
        denseScore5: denseResults[4]?.score ?? 0,
        overlapAt5,
      });

      // Both modes should return at least 1 result for known queries
      expect(hybridResults.length + denseResults.length, "at least one mode should return results")
        .toBeGreaterThan(0);
    }, 15_000);
  }

  it("prints comparison table and verdict", () => {
    if (rows.length === 0) return;

    const header =
      "Query                                    Intent   S1-hyb S1-den S5-hyb S5-den Overlap";
    const sep = "-".repeat(header.length);

    console.log("\n## Hybrid vs Dense-Only Comparison\n");
    console.log(header);
    console.log(sep);

    for (const row of rows) {
      const q = row.query.slice(0, 40).padEnd(40);
      const intent = row.intent.padEnd(8);
      const s1h = row.hybridScore1.toFixed(3).padStart(6);
      const s1d = row.denseScore1.toFixed(3).padStart(6);
      const s5h = row.hybridScore5.toFixed(3).padStart(6);
      const s5d = row.denseScore5.toFixed(3).padStart(6);
      const overlap = row.overlapAt5.toFixed(2).padStart(7);
      const flag = row.overlapAt5 < 0.6 ? "  ← hybrid adds value" : "";
      console.log(`${q} ${intent} ${s1h} ${s1d} ${s5h} ${s5d} ${overlap}${flag}`);
    }

    const lowOverlap = rows.filter((r) => r.overlapAt5 < 0.6);
    console.log(
      `\n${lowOverlap.length}/${rows.length} queries where hybrid diverges from dense-only (overlap < 0.6)`,
    );

    if (lowOverlap.length > rows.length / 2) {
      console.log("\nVerdict: KEEP hybrid — diverges on >50% of queries, meaningful BM25 signal.");
    } else {
      console.log("\nVerdict: CONSIDER dense-only — results largely overlap, simpler pipeline may suffice.");
    }

    if (lowOverlap.length > 0) {
      console.log("\n### Low-overlap queries\n");
      for (const row of lowOverlap) {
        console.log(`"${row.query}" (${row.intent})`);
        console.log(`  hybrid : ${row.hybridTop5.join(", ") || "(empty)"}`);
        console.log(`  dense  : ${row.denseTop5.join(", ") || "(empty)"}`);
      }
    }
  });
});
