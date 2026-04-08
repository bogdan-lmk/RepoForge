"use client";

import { useState, useCallback } from "react";

export interface SavedIdea {
  id: string;
  title: string;
  thesis: string;
  scores: Record<string, number | null>;
  repoSlugs: string[];
  capabilities: string[];
  demo72h: string | null;
  formula: string | null;
  queryText: string;
  savedAt: number;
}

const STORAGE_KEY = "category-forge-saved-ideas";

function readStorage(): SavedIdea[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: SavedIdea[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

export function useSavedIdeas() {
  const [saved, setSaved] = useState<SavedIdea[]>(readStorage);

  const save = useCallback((idea: Omit<SavedIdea, "id" | "savedAt">) => {
    setSaved((prev) => {
      if (prev.some((s) => s.title === idea.title)) return prev;
      const next: SavedIdea = {
        ...idea,
        id: crypto.randomUUID(),
        savedAt: Date.now(),
      };
      const updated = [next, ...prev];
      writeStorage(updated);
      return updated;
    });
  }, []);

  const unsave = useCallback((id: string) => {
    setSaved((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      writeStorage(updated);
      return updated;
    });
  }, []);

  const isSaved = useCallback(
    (title: string) => saved.some((s) => s.title === title),
    [saved],
  );

  return { saved, save, unsave, isSaved };
}
