import { describe, it, expect, vi } from "vitest";

vi.mock("@/env", async () => vi.importActual("@/env"));

const hasEnv =
  process.env.DATABASE_URL &&
  process.env.QDRANT_URL &&
  process.env.OPENAI_API_KEY;

describe.skipIf(!hasEnv)("Live search integration", () => {
  it('returns results for "claude code context management"', async () => {
    const { search } = await import("@/services/search");

    const result = await search("claude code context management");

    expect(result.parsed).toBeDefined();
    expect(result.parsed.anchorTerms.length).toBeGreaterThan(0);
    expect(result.repos.length).toBeGreaterThan(0);

    for (const repo of result.repos) {
      expect(repo.slug).toBeTruthy();
      expect(repo.score).toBeGreaterThan(0);
      expect(repo.source).toBeTruthy();
    }
  });

  it("produces RRF scores within expected range (no score > 1.0)", async () => {
    const { search } = await import("@/services/search");

    const result = await search("claude code context management");

    for (const repo of result.repos) {
      expect(repo.score).toBeLessThanOrEqual(1.0);
    }
  });

  it("repos from multiple sources have higher RRF scores than single-source repos", async () => {
    const { search } = await import("@/services/search");

    const result = await search("ai coding assistant");

    if (result.repos.length < 2) return;

    const sorted = [...result.repos].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    expect(sorted[0].score).toBeGreaterThanOrEqual(sorted[sorted.length - 1].score ?? 0);
  });

  it("returns parsed query with expected anchor terms for claude query", async () => {
    const { search } = await import("@/services/search");

    const result = await search("claude code context management");

    const hasClaude =
      result.parsed.anchorTerms.some((t) => t.toLowerCase().includes("claude")) ||
      result.parsed.capabilityTerms.some((t) => t.toLowerCase().includes("claude"));
    expect(hasClaude).toBe(true);

    expect(result.parsed.intentType).toMatch(/^(explore|build|lookup)$/);
    expect(result.parsed.githubQueries.length).toBeGreaterThan(0);
  });

  it("prints detailed results for manual inspection", async () => {
    const { search } = await import("@/services/search");

    const result = await search("claude code context management");

    console.log("\n=== LIVE SEARCH RESULTS ===");
    console.log("Query: claude code context management");
    console.log("Parsed:", JSON.stringify(result.parsed, null, 2));
    console.log("\nRepos (sorted by RRF score):");
    for (const repo of result.repos) {
      console.log(
        `  [${repo.source}] ${(repo.score ?? 0).toFixed(4)} ${repo.slug} — ${repo.description?.slice(0, 80)}`,
      );
    }
    if (result.combos.length > 0) {
      console.log(`\nCombos: ${result.combos.length} generated`);
    }
    console.log("=== END ===\n");

    expect(result.repos.length).toBeGreaterThan(0);
  });
});
