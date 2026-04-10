import type { ComboIdea } from "@/core/types";

export const HOME_SEARCH_SNAPSHOT_KEY = "category-forge:home-search-snapshot";
export const HOME_SEARCH_RESTORE_QUERY_KEY = "category-forge:home-search-restore-query";
export const HOME_SEARCH_SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000;

export interface HomeSearchRepo {
  slug: string;
  name: string;
  url: string;
  description: string;
  language: string | null;
  topics: string[];
  stars: number;
  capabilities: string[];
  primitives: string[];
  score?: number;
  source?: string;
}

export interface HomeSearchSnapshot {
  query: string;
  repos: HomeSearchRepo[];
  ideas: ComboIdea[];
  savedAt: number;
}

export function createHomeSearchSnapshot(
  query: string,
  repos: HomeSearchRepo[],
  ideas: ComboIdea[],
  savedAt = Date.now(),
): HomeSearchSnapshot {
  return {
    query,
    repos,
    ideas,
    savedAt,
  };
}

export function parseHomeSearchSnapshot(raw: string | null): HomeSearchSnapshot | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isHomeSearchSnapshot(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function shouldRestoreHomeSearchSnapshot(
  snapshot: HomeSearchSnapshot | null,
  input: {
    query: string;
    restoreQuery: string | null;
    now?: number;
  },
) {
  if (!snapshot || !input.restoreQuery) {
    return false;
  }

  const now = input.now ?? Date.now();
  return (
    snapshot.query === input.query &&
    input.restoreQuery === input.query &&
    now - snapshot.savedAt <= HOME_SEARCH_SNAPSHOT_MAX_AGE_MS
  );
}

function isHomeSearchSnapshot(value: unknown): value is HomeSearchSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.query === "string" &&
    typeof value.savedAt === "number" &&
    Array.isArray(value.repos) &&
    value.repos.every(isHomeSearchRepo) &&
    Array.isArray(value.ideas)
  );
}

function isHomeSearchRepo(value: unknown): value is HomeSearchRepo {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.slug === "string" &&
    typeof value.name === "string" &&
    typeof value.url === "string" &&
    typeof value.description === "string" &&
    (typeof value.language === "string" || value.language === null) &&
    Array.isArray(value.topics) &&
    Array.isArray(value.capabilities) &&
    Array.isArray(value.primitives) &&
    typeof value.stars === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
