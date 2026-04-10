"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Nav } from "@/components/Nav";
import { SearchBar } from "@/components/SearchBar";
import { RepoCard } from "@/components/RepoCard";
import { IdeaCard } from "@/components/IdeaCard";
import { ForgeSpinner } from "@/components/ForgeSpinner";
import { AuroraBackground } from "@/components/AuroraBackground";
import { CursorGlow } from "@/components/CursorGlow";
import type { ComboIdea } from "@/core/types";
import { enqueueEvent, flushEvents } from "@/lib/analytics";
import {
  createHomeSearchSnapshot,
  HOME_SEARCH_RESTORE_QUERY_KEY,
  HOME_SEARCH_SNAPSHOT_KEY,
  parseHomeSearchSnapshot,
  shouldRestoreHomeSearchSnapshot,
  type HomeSearchRepo,
} from "@/lib/home-search-session";

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 140, damping: 18 },
  },
};

const heroTitle: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.3 } },
};

const heroLetter: Variants = {
  hidden: { opacity: 0, y: 40, rotateX: -40 },
  visible: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { type: "spring" as const, stiffness: 120, damping: 14 },
  },
};

const badgePop: Variants = {
  hidden: { opacity: 0, scale: 0.5, y: 10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 18, delay: 0.1 },
  },
};

const sectionHeader: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

function Word({ text, gradient }: { text: string; gradient?: boolean }) {
  return (
    <span className="inline-flex overflow-hidden" style={{ perspective: "600px" }}>
      {text.split("").map((char, i) => (
        <motion.span
          key={`${char}-${i}`}
          variants={heroLetter}
          className={gradient ? "animate-gradient-text bg-gradient-to-r from-teal via-[#5EEAD4] to-teal bg-[length:200%_auto] bg-clip-text" : ""}
          style={{
            display: "inline-block",
            whiteSpace: char === " " ? "pre" : undefined,
            transformOrigin: "bottom",
            WebkitTextFillColor: gradient ? "transparent" : undefined,
          }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
}

function TrustMetric({ value, label, delay }: { value: string; label: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="flex flex-col items-center gap-1"
    >
      <span className="font-mono text-xl font-bold text-fg md:text-2xl">{value}</span>
      <span className="text-[11px] uppercase tracking-wider text-fg-muted">{label}</span>
    </motion.div>
  );
}

export default function HomeContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [repos, setRepos] = useState<HomeSearchRepo[]>([]);
  const [ideas, setIdeas] = useState<ComboIdea[]>([]);
  const [searched, setSearched] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const updateURL = useCallback(
    (q: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) {
        params.set("q", q);
      } else {
        params.delete("q");
      }
      router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
    },
    [searchParams, pathname, router],
  );

  const handleSearch = useCallback(
    async (q: string) => {
      const source = searched ? "results-searchbar" : "hero-searchbar";
      clearPendingRestore();

      enqueueEvent({
        type: searched ? "query_retried" : "search_started",
        queryText: q,
        page: "home",
        source,
      });

      setLoading(true);
      setSearched(true);
      setRepos([]);
      setIdeas([]);
      setSearchQuery(q);
      updateURL(q);

      try {
        const res = await fetch("/api/ideas/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q }),
        });
        if (!res.ok) throw new Error("Search failed");
        const json = await res.json();
        const payload = json.data ?? json;
        const nextRepos = (payload.repos ?? []) as HomeSearchRepo[];
        const nextIdeas = (payload.combos ?? []) as ComboIdea[];

        setRepos(nextRepos);
        setIdeas(nextIdeas);
        persistSearchSnapshot(q, nextRepos, nextIdeas);
        enqueueEvent({
          type: "results_rendered",
          queryText: q,
          page: "home",
          source,
          payload: {
            repoCount: Array.isArray(payload.repos) ? payload.repos.length : 0,
            comboCount: Array.isArray(payload.combos) ? payload.combos.length : 0,
          },
        });
        void flushEvents();
      } catch {
        setRepos([]);
        setIdeas([]);
        enqueueEvent({
          type: "search_failed",
          queryText: q,
          page: "home",
          source,
        });
        void flushEvents();
      } finally {
        setLoading(false);
      }
    },
    [searched, updateURL],
  );

  const handleClear = useCallback(() => {
    setSearched(false);
    setRepos([]);
    setIdeas([]);
    setSearchQuery("");
    clearSearchSession();
    updateURL("");
  }, [updateURL]);

  useEffect(() => {
    const q = searchParams.get("q");
    if (!q) {
      return;
    }

    const snapshot = readSearchSnapshot();
    const restoreQuery = readRestoreQuery();
    if (snapshot && shouldRestoreHomeSearchSnapshot(snapshot, { query: q, restoreQuery })) {
      setSearched(true);
      setSearchQuery(q);
      setRepos(snapshot.repos);
      setIdeas(snapshot.ideas);
      return;
    }

    handleSearch(q);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(async (idea: ComboIdea) => {
    if (idea.id) {
      const response = await fetch(`/api/combos/${idea.id}`, { method: "PATCH" });
      if (response.ok) {
        enqueueEvent({
          type: "combo_saved",
          comboId: idea.id,
          queryText: searchQuery || null,
          page: "home",
          source: "ideas-panel",
          payload: { title: idea.title },
        });
        void flushEvents();
      }
      return;
    }

    const response = await fetch("/api/combos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(idea),
    });
    if (response.ok) {
      enqueueEvent({
        type: "combo_saved",
        queryText: searchQuery || null,
        page: "home",
        source: "ideas-panel",
        payload: { title: idea.title },
      });
      void flushEvents();
    }
  }, [searchQuery]);

  return (
    <div className="relative flex min-h-screen flex-col">
      <AuroraBackground />
      <CursorGlow />

      <div className="relative z-10 flex min-h-screen flex-col">
        <Nav />

        <AnimatePresence mode="wait">
          {!searched ? (
            <motion.main
              key="hero"
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.3 } }}
              className="flex flex-1 flex-col items-center justify-center px-5 pb-12 pt-4 md:pb-20"
            >
              <motion.div variants={badgePop} className="mb-6 md:mb-8">
                <div className="flex items-center gap-2.5 rounded-full border border-teal/15 bg-teal/[0.06] px-4 py-2 backdrop-blur-sm">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal opacity-60" />
                    <span className="relative inline-flex size-2 rounded-full bg-teal" />
                  </span>
                  <span className="text-[12px] font-medium text-teal">
                    AI-Powered Repo Intelligence
                  </span>
                </div>
              </motion.div>

              <motion.h1
                variants={heroTitle}
                initial="hidden"
                animate="visible"
                className="mb-4 max-w-[720px] text-center text-[clamp(2rem,6vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-fg md:mb-5"
              >
                <Word text="Discover " />
                <Word text="repos." />
                <br />
                <Word text="Build " />
                <Word text="products." gradient />
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1, duration: 0.6 }}
                className="mb-8 max-w-[480px] text-center text-base leading-relaxed text-fg-secondary md:mb-10 md:text-[17px]"
              >
                Search GitHub repositories and forge them into product ideas with AI
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 1.3, type: "spring", stiffness: 120, damping: 18 }}
                className="w-full"
              >
                <SearchBar onSearch={handleSearch} variant="hero" onClear={handleClear} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2, duration: 0.8 }}
                className="mt-10 flex items-center gap-8 md:mt-14 md:gap-12"
              >
                <TrustMetric value="50k+" label="Repos indexed" delay={2.1} />
                <div className="h-8 w-px bg-border" />
                <TrustMetric value="<2s" label="Idea generation" delay={2.3} />
                <div className="h-8 w-px bg-border" />
                <TrustMetric value="6" label="Score dimensions" delay={2.5} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.6, duration: 0.6 }}
                className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-fg-muted md:mt-10"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="size-[14px] text-teal/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Semantic search
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="size-[14px] text-teal/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  AI-powered combos
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="size-[14px] text-teal/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  72h demo plans
                </span>
              </motion.div>
            </motion.main>
          ) : loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 items-center justify-center px-5 pt-10"
            >
              <ForgeSpinner step={2} />
            </motion.div>
          ) : (
            <motion.main
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col gap-6 px-4 py-6 md:px-6 md:py-8 lg:py-10"
            >
              <div className="mx-auto w-full max-w-[1200px]">
                <SearchBar onSearch={handleSearch} loading={loading} variant="compact" defaultValue={searchQuery} onClear={handleClear} />
              </div>

              <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 lg:flex-row">
                <motion.section
                  variants={stagger}
                  initial="hidden"
                  animate="visible"
                  className="flex flex-1 flex-col gap-3"
                >
                  <motion.div variants={sectionHeader} className="flex items-center justify-between pb-1">
                    <div className="flex items-center gap-2">
                      <div className="flex size-6 items-center justify-center rounded-md bg-surface-elevated">
                        <svg className="size-3.5 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium text-fg-secondary">Found Repos</span>
                    </div>
                    <span className="flex h-6 items-center rounded-md bg-teal-muted px-2.5 font-mono text-[11px] font-bold text-teal">
                      {repos.length}
                    </span>
                  </motion.div>

                  <motion.div variants={stagger} className="flex flex-col gap-2">
                    {repos.map((repo) => (
                      <motion.div key={repo.slug} variants={fadeUp}>
                        <RepoCard
                          slug={repo.slug}
                          name={repo.name}
                          description={repo.description}
                          language={repo.language}
                          stars={repo.stars}
                          onOpen={() => {
                            enqueueEvent({
                              type: "repo_opened",
                              repoSlug: repo.slug,
                              queryText: searchQuery || null,
                              page: "home",
                              source: "repos-panel",
                            });
                            void flushEvents();
                          }}
                        />
                      </motion.div>
                    ))}
                  </motion.div>

                  {repos.length === 0 && (
                    <p className="py-8 text-center text-sm text-fg-muted">
                      No repos found. Try a different query.
                    </p>
                  )}
                </motion.section>

                <motion.section
                  variants={stagger}
                  initial="hidden"
                  animate="visible"
                  className="flex w-full flex-col gap-3 lg:w-[440px] lg:shrink-0"
                >
                  <motion.div variants={sectionHeader} className="flex items-center justify-between pb-1">
                    <div className="flex items-center gap-2">
                      <div className="flex size-6 items-center justify-center rounded-md bg-teal/10">
                        <svg className="size-3.5 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium text-fg-secondary">Product Ideas</span>
                    </div>
                    <span className="flex h-6 items-center rounded-md bg-teal-muted px-2.5 text-[11px] font-bold text-teal">
                      AI Generated
                    </span>
                  </motion.div>

                  <motion.div variants={stagger} className="flex flex-col gap-3">
                    {ideas.map((idea, i) => (
                      <motion.div key={i} variants={fadeUp}>
                        <IdeaCard
                          index={i}
                          title={idea.title}
                          description={idea.thesis}
                          score={
                            idea.scores
                              ? (idea.scores.novelty +
                                  idea.scores.composableFit +
                                  idea.scores.accessibilityWedge) /
                                3
                              : null
                          }
                          tags={idea.repoSlugs?.slice(0, 3)}
                          demo72h={idea.demo72h}
                          href={idea.id ? `/ideas/${idea.id}` : null}
                          onOpen={() => {
                            markPendingRestore(searchQuery);
                            enqueueEvent({
                              type: "combo_expanded",
                              comboId: idea.id ?? null,
                              queryText: searchQuery || null,
                              page: "home",
                              source: "ideas-panel",
                              payload: { title: idea.title },
                            });
                            void flushEvents();
                          }}
                          onSave={() => handleSave(idea)}
                        />
                      </motion.div>
                    ))}
                  </motion.div>

                  {ideas.length === 0 && repos.length > 0 && (
                    <p className="py-8 text-center text-sm text-fg-muted">
                      Generating ideas...
                    </p>
                  )}
                </motion.section>
              </div>
            </motion.main>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function persistSearchSnapshot(query: string, repos: HomeSearchRepo[], ideas: ComboIdea[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const snapshot = createHomeSearchSnapshot(query, repos, ideas);
    window.sessionStorage.setItem(HOME_SEARCH_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures; search should still work without snapshot restore.
  }
}

function readSearchSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return parseHomeSearchSnapshot(window.sessionStorage.getItem(HOME_SEARCH_SNAPSHOT_KEY));
  } catch {
    return null;
  }
}

function markPendingRestore(query: string) {
  if (typeof window === "undefined" || !query) {
    return;
  }

  try {
    window.sessionStorage.setItem(HOME_SEARCH_RESTORE_QUERY_KEY, query);
  } catch {
    // Ignore storage failures; navigation to detail should still proceed.
  }
}

function readRestoreQuery() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage.getItem(HOME_SEARCH_RESTORE_QUERY_KEY);
  } catch {
    return null;
  }
}

function clearPendingRestore() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(HOME_SEARCH_RESTORE_QUERY_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function clearSearchSession() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(HOME_SEARCH_SNAPSHOT_KEY);
    window.sessionStorage.removeItem(HOME_SEARCH_RESTORE_QUERY_KEY);
  } catch {
    // Ignore storage failures.
  }
}
