import { describe, it, expect } from "vitest";
import { weightedRRF } from "@/services/search";
import type { RepoDoc } from "@/core/types";

function makeRepo(overrides: Partial<RepoDoc> & Pick<RepoDoc, "slug">): RepoDoc {
  return {
    name: overrides.slug,
    url: `https://github.com/${overrides.slug}`,
    description: "",
    readme: "",
    language: null,
    topics: [],
    stars: 0,
    capabilities: [],
    primitives: [],
    score: 0,
    source: "test",
    ...overrides,
  };
}

describe("weightedRRF", () => {
  it("returns empty array when all sources are empty", () => {
    const result = weightedRRF([
      { repos: [], weight: 1.4 },
      { repos: [], weight: 1.2 },
      { repos: [], weight: 1.0 },
    ]);
    expect(result).toEqual([]);
  });

  it("computes correct score for a single repo in a single source", () => {
    const repo = makeRepo({ slug: "foo/bar", score: 0.9 });
    const result = weightedRRF([{ repos: [repo], weight: 1.4 }], { k: 20 });
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("foo/bar");
    expect(result[0].score).toBeCloseTo(1.4 / 21, 10);
  });

  it("sums contributions when same repo appears in multiple sources (multi-source boost)", () => {
    const ftsRepo = makeRepo({ slug: "langchain/langchain", score: 0.8, source: "fts" });
    const vecRepo = makeRepo({ slug: "langchain/langchain", score: 0.7, source: "vector" });
    const ghRepo = makeRepo({ slug: "langchain/langchain", score: 0.6, source: "github" });

    const result = weightedRRF(
      [
        { repos: [ftsRepo], weight: 1.4 },
        { repos: [vecRepo], weight: 1.2 },
        { repos: [ghRepo], weight: 1.0 },
      ],
      { k: 20 },
    );

    expect(result).toHaveLength(1);
    const expected = 1.4 / 21 + 1.2 / 21 + 1.0 / 21;
    expect(result[0].score).toBeCloseTo(expected, 10);
  });

  it("ranks repos correctly across sources with different weights", () => {
    const ftsRepo = makeRepo({ slug: "a/fts-only", score: 0.9 });
    const vecRepo = makeRepo({ slug: "b/vec-only", score: 0.9 });
    const ghRepo = makeRepo({ slug: "c/gh-only", score: 0.9 });

    const result = weightedRRF(
      [
        { repos: [ftsRepo], weight: 1.4 },
        { repos: [vecRepo], weight: 1.2 },
        { repos: [ghRepo], weight: 1.0 },
      ],
      { k: 20 },
    );

    expect(result[0].slug).toBe("a/fts-only");
    expect(result[1].slug).toBe("b/vec-only");
    expect(result[2].slug).toBe("c/gh-only");
  });

  it("merges metadata from richer source", () => {
    const repoNoReadme = makeRepo({
      slug: "x/project",
      readme: "",
      capabilities: [],
      source: "vector",
    });
    const repoWithReadme = makeRepo({
      slug: "x/project",
      readme: "# Project\nLong readme here",
      capabilities: ["does-cool-stuff"],
      source: "fts",
    });

    const result = weightedRRF([
      { repos: [repoNoReadme], weight: 1.2 },
      { repos: [repoWithReadme], weight: 1.4 },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].readme).toBe("# Project\nLong readme here");
    expect(result[0].capabilities).toEqual(["does-cool-stuff"]);
  });

  it("deduplicates by slug across three sources", () => {
    const repo = makeRepo({ slug: "shared/repo", score: 0.5 });

    const result = weightedRRF(
      [
        { repos: [repo, makeRepo({ slug: "other/a" })], weight: 1.4 },
        { repos: [makeRepo({ slug: "other/b" }), repo], weight: 1.2 },
        { repos: [repo, makeRepo({ slug: "other/c" })], weight: 1.0 },
      ],
      { k: 20 },
    );

    const slugs = result.map((r) => r.slug);
    expect(slugs.filter((s) => s === "shared/repo")).toHaveLength(1);
    expect(result).toHaveLength(4);
    const shared = result.find((r) => r.slug === "shared/repo")!;
    const singleSource = result.find((r) => r.slug === "other/a")!;
    expect(shared.score!).toBeGreaterThan(singleSource.score ?? 0);
  });

  it("merges primitives from richer source", () => {
    const noPrim = makeRepo({
      slug: "p/repo",
      primitives: [],
      source: "fts",
    });
    const withPrim = makeRepo({
      slug: "p/repo",
      primitives: ["api-call", "webhook"],
      source: "github",
    });

    const result = weightedRRF([
      { repos: [noPrim], weight: 1.4 },
      { repos: [withPrim], weight: 1.0 },
    ]);

    expect(result[0].primitives).toEqual(["api-call", "webhook"]);
  });

  it("merges capabilities from vector source into fts result", () => {
    const noCap = makeRepo({
      slug: "cap/repo",
      capabilities: [],
      source: "fts",
    });
    const withCap = makeRepo({
      slug: "cap/repo",
      capabilities: ["semantic-search"],
      source: "vector",
    });

    const result = weightedRRF([
      { repos: [noCap], weight: 1.4 },
      { repos: [withCap], weight: 1.2 },
    ]);

    expect(result[0].capabilities).toEqual(["semantic-search"]);
  });
});
