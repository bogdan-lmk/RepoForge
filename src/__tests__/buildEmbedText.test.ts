import { describe, it, expect } from "vitest";
import { buildEmbedText } from "@/lib/qdrant";
import type { RepoDoc } from "@/core/types";

function makeRepo(overrides: Partial<RepoDoc> = {}): RepoDoc {
  return {
    slug: "foo/bar",
    name: "Bar",
    url: "https://github.com/foo/bar",
    description: "A cool project",
    readme: "# Bar\nThis is a great project with many features.",
    language: "TypeScript",
    topics: ["cli", "devtools"],
    stars: 100,
    capabilities: ["build-widgets", "deploy-fast"],
    primitives: [],
    ...overrides,
  };
}

describe("buildEmbedText", () => {
  it("includes all fields in the embedding text", () => {
    const repo = makeRepo();
    const text = buildEmbedText(repo);

    expect(text).toContain("foo/bar");
    expect(text).toContain("Bar");
    expect(text).toContain("cli");
    expect(text).toContain("devtools");
    expect(text).toContain("build-widgets");
    expect(text).toContain("deploy-fast");
    expect(text).toContain("A cool project");
    expect(text).toContain("# Bar");
  });

  it("handles missing readme, topics, capabilities without extra spaces", () => {
    const repo = makeRepo({ readme: "", topics: [], capabilities: [] });
    const text = buildEmbedText(repo);

    expect(text).toContain("foo/bar");
    expect(text).toContain("Bar");
    expect(text).toContain("A cool project");
    expect(text).not.toMatch(/\s{2,}/);
  });

  it("places slug first in the embedding text (signal priority)", () => {
    const repo = makeRepo();
    const text = buildEmbedText(repo);

    expect(text.indexOf("foo/bar")).toBe(0);
  });

  it("truncates README to 1500 characters", () => {
    const longReadme = "x".repeat(5000);
    const repo = makeRepo({ readme: longReadme });
    const text = buildEmbedText(repo);

    const readmeInText = text.slice(text.indexOf("x".repeat(10)));
    expect(readmeInText.length).toBe(1500);
  });

  it("handles completely empty repo gracefully", () => {
    const repo: RepoDoc = {
      slug: "",
      name: "",
      url: "",
      description: "",
      readme: "",
      language: null,
      topics: [],
      stars: 0,
      capabilities: [],
      primitives: [],
    };
    const text = buildEmbedText(repo);
    expect(text).toBe("");
  });

  it("filters out falsy parts", () => {
    const repo: RepoDoc = {
      slug: "only/slug",
      name: "",
      url: "",
      description: "",
      readme: "",
      language: null,
      topics: [],
      stars: 0,
      capabilities: [],
      primitives: [],
    };
    const text = buildEmbedText(repo);
    expect(text).toBe("only/slug");
  });
});
