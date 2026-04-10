import { describe, expect, it } from "vitest";
import type { ComboIdea } from "@/core/types";
import {
  createHomeSearchSnapshot,
  parseHomeSearchSnapshot,
  shouldRestoreHomeSearchSnapshot,
  type HomeSearchRepo,
} from "@/lib/home-search-session";

function makeRepo(overrides: Partial<HomeSearchRepo> = {}): HomeSearchRepo {
  return {
    slug: "acme/repo",
    name: "repo",
    url: "https://github.com/acme/repo",
    description: "Repository description",
    language: "TypeScript",
    topics: ["agents"],
    stars: 42,
    capabilities: ["planning"],
    primitives: ["cli"],
    score: 0.91,
    source: "hybrid+rerank",
    ...overrides,
  };
}

function makeIdea(overrides: Partial<ComboIdea> = {}): ComboIdea {
  return {
    id: 7,
    title: "Agent Console",
    thesis: "Turn repo orchestration into an operator console.",
    formula: "planner + runner + dashboard",
    repoSlugs: ["acme/repo"],
    repoRoles: { "acme/repo": "anchor" },
    steps: ["Index repos", "Generate combos"],
    recommendedShell: "web",
    whatIsBeingCombined: "A repo index with a combo generator.",
    capabilities: ["orchestration"],
    supportingPrimitives: ["search", "eval"],
    whyFit: "The repos complement each other.",
    useCase: "Internal platform team",
    whyBetterThanSingle: "The stack is more complete together.",
    firstUser: "DevEx lead",
    demo72h: "Ship a searchable prototype.",
    keyRisks: ["Weak repo fit"],
    scores: {
      novelty: 0.7,
      composableFit: 0.8,
      accessibilityWedge: 0.6,
      timeToDemo: 0.7,
      categoryUpside: 0.65,
      narrativeClarity: 0.75,
    },
    ...overrides,
  };
}

describe("home search session", () => {
  it("round-trips a valid snapshot", () => {
    const snapshot = createHomeSearchSnapshot("agent frameworks", [makeRepo()], [makeIdea()], 123);
    const parsed = parseHomeSearchSnapshot(JSON.stringify(snapshot));

    expect(parsed).toEqual(snapshot);
  });

  it("rejects malformed snapshots", () => {
    expect(parseHomeSearchSnapshot("{bad json")).toBeNull();
    expect(parseHomeSearchSnapshot(JSON.stringify({ query: 1 }))).toBeNull();
  });

  it("restores only for matching one-time back navigation context", () => {
    const snapshot = createHomeSearchSnapshot("agent frameworks", [makeRepo()], [makeIdea()], 1_000);

    expect(
      shouldRestoreHomeSearchSnapshot(snapshot, {
        query: "agent frameworks",
        restoreQuery: "agent frameworks",
        now: 10_000,
      }),
    ).toBe(true);

    expect(
      shouldRestoreHomeSearchSnapshot(snapshot, {
        query: "other query",
        restoreQuery: "agent frameworks",
        now: 10_000,
      }),
    ).toBe(false);

    expect(
      shouldRestoreHomeSearchSnapshot(snapshot, {
        query: "agent frameworks",
        restoreQuery: null,
        now: 10_000,
      }),
    ).toBe(false);
  });

  it("does not restore expired snapshots", () => {
    const snapshot = createHomeSearchSnapshot("agent frameworks", [makeRepo()], [makeIdea()], 1_000);

    expect(
      shouldRestoreHomeSearchSnapshot(snapshot, {
        query: "agent frameworks",
        restoreQuery: "agent frameworks",
        now: 1_000 + 30 * 60 * 1000 + 1,
      }),
    ).toBe(false);
  });
});
