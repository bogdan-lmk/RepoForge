"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import { Nav } from "@/components/Nav";
import { SearchBar } from "@/components/SearchBar";
import { RepoCard } from "@/components/RepoCard";
import { IdeaCard } from "@/components/IdeaCard";
import { ShowcaseCard } from "@/components/ShowcaseCard";
import { ForgeSpinner } from "@/components/ForgeSpinner";
import { AuroraBackground } from "@/components/AuroraBackground";
import { CursorGlow } from "@/components/CursorGlow";
import type { ComboIdea, SearchTrace } from "@/core/types";
import type { HomeMetrics } from "@/lib/home-metrics";
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

const INSPIRATION_CHIPS = [
  { id: "chip-stripe", text: "Open-source Stripe alternative" },
  { id: "chip-review", text: "AI code review tool" },
  { id: "chip-collab", text: "Real-time collaboration app" },
  { id: "chip-portfolio", text: "Developer portfolio generator" },
  { id: "chip-database", text: "Serverless database for edge" },
  { id: "chip-mocking", text: "Mock APIs from the command line" },
] as const;

const DICE_QUERIES = [
  { id: "dice-crm-small-teams", text: "Open-source CRM for small teams" },
  { id: "dice-privacy-analytics", text: "Privacy-first analytics dashboard" },
  { id: "dice-github-triage-bot", text: "GitHub issues triage bot" },
  { id: "dice-feature-flags", text: "Feature flag service for startups" },
  { id: "dice-local-notes", text: "Local-first notes app" },
  { id: "dice-screenshot-review", text: "Screenshot review tool" },
  { id: "dice-browser-runner", text: "Browser automation runner" },
  { id: "dice-docs-search", text: "Docs site search for developer tools" },
  { id: "dice-community-forum", text: "Community forum alternative" },
  { id: "dice-newsletter-platform", text: "Newsletter platform for creators" },
  { id: "dice-snippet-manager", text: "Code snippet manager" },
  { id: "dice-onboarding-checklist", text: "Onboarding checklist builder" },
  { id: "dice-password-extension", text: "Password manager browser extension" },
  { id: "dice-form-builder", text: "Form builder for ops teams" },
  { id: "dice-error-tracking", text: "Error tracking dashboard" },
  { id: "dice-ci-insights", text: "CI insights dashboard" },
  { id: "dice-design-handoff", text: "Design handoff tool" },
  { id: "dice-chatbot-widget", text: "Chatbot widget for SaaS apps" },
  { id: "dice-kanban", text: "Project management kanban" },
  { id: "dice-blog-cms", text: "Blog CMS for developers" },
] as const;

const FORGE_MIN_LOADING_MS = 1400;
const FORGE_STEP_DELAYS = [0, 450, 950, 1300] as const;

const numberFormatter = new Intl.NumberFormat("en-US");

function formatCount(value: number | null): string {
  return value === null ? "—" : numberFormatter.format(value);
}

function formatLatency(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}ms`;
}

function truncate(text: string, max = 36): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function VerticalDivider() {
  return <div aria-hidden="true" className="h-8 w-px bg-border" />;
}

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

export default function HomeContent({
  stats,
  featuredCombos,
}: {
  stats: HomeMetrics;
  featuredCombos: ComboIdea[];
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [loading, setLoading] = useState(false);
  const [repos, setRepos] = useState<HomeSearchRepo[]>([]);
  const [ideas, setIdeas] = useState<ComboIdea[]>([]);
  const [searched, setSearched] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTrace, setSearchTrace] = useState<SearchTrace | null>(null);
  const [traceId, setTraceId] = useState<number | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [forgeStep, setForgeStep] = useState(1);
  const progressTimersRef = useRef<number[]>([]);
  const toastTimerRef = useRef<number | null>(null);

  const clearProgressTimers = useCallback(() => {
    for (const timer of progressTimersRef.current) {
      window.clearTimeout(timer);
    }
    progressTimersRef.current = [];
  }, []);

  const clearToastTimer = useCallback(() => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearProgressTimers();
    clearToastTimer();
  }, [clearProgressTimers, clearToastTimer]);

  const scheduleProgressStep = useCallback((step: number, delay: number) => {
    const timer = window.setTimeout(() => {
      setForgeStep(step);
    }, delay);
    progressTimersRef.current.push(timer);
  }, []);

  const showToast = useCallback((kind: "error" | "success", message: string) => {
    setToast({ kind, message });
    clearToastTimer();
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3500);
  }, [clearToastTimer]);

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
    async (q: string, sourceOverride?: string) => {
      const source = sourceOverride ?? (searched ? "results-searchbar" : "hero-searchbar");
      clearPendingRestore();
      clearProgressTimers();
      setForgeStep(1);
      setSearchTrace(null);
      setSearchError(null);

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

      if (!reduceMotion) {
        scheduleProgressStep(2, FORGE_STEP_DELAYS[1]);
        scheduleProgressStep(3, FORGE_STEP_DELAYS[2]);
        scheduleProgressStep(4, FORGE_STEP_DELAYS[3]);
      }

      const startedAt = performance.now();

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
        setSearchTrace((payload.trace ?? null) as SearchTrace | null);
        setTraceId(payload.trace?.id ?? null);
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
        setSearchTrace(null);
        setSearchError("Search failed. Please try again in a moment.");
        setTraceId(null);
        enqueueEvent({
          type: "search_failed",
          queryText: q,
          page: "home",
          source,
        });
        void flushEvents();
      } finally {
        const elapsed = performance.now() - startedAt;
        const remaining = reduceMotion ? 0 : Math.max(FORGE_MIN_LOADING_MS - elapsed, 0);
        if (remaining > 0) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, remaining);
          });
        }
        clearProgressTimers();
        setLoading(false);
      }
    },
    [searched, updateURL, clearProgressTimers, scheduleProgressStep, reduceMotion],
  );

  const handleClear = useCallback(() => {
    setSearched(false);
    setRepos([]);
    setIdeas([]);
    setSearchQuery("");
    setSearchTrace(null);
    setSearchError(null);
    setTraceId(null);
    setForgeStep(1);
    clearProgressTimers();
    clearSearchSession();
    updateURL("");
  }, [updateURL, clearProgressTimers]);

  const handleChipClick = useCallback(
    (chip: { id: string; text: string }, position: number) => {
      enqueueEvent({
        type: "chip_clicked",
        page: "home",
        source: "inspiration-chips",
        payload: {
          chipId: chip.id,
          chipText: chip.text,
          position,
        },
      });
      void flushEvents();
      void handleSearch(chip.text, "inspiration-chips");
    },
    [handleSearch],
  );

  const handleDiceClick = useCallback(() => {
    const picked = pickRandom(DICE_QUERIES);
    enqueueEvent({
      type: "dice_clicked",
      page: "home",
      source: "hero-dice",
      payload: {
        poolSize: DICE_QUERIES.length,
        pickedId: picked.id,
      },
    });
    void flushEvents();
    void handleSearch(picked.text, "hero-dice");
  }, [handleSearch]);

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
    try {
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
          return;
        }

        enqueueEvent({
          type: "combo_save_failed",
          comboId: idea.id,
          queryText: searchQuery || null,
          page: "home",
          source: "ideas-panel",
          payload: {
            title: idea.title,
            status: response.status,
          },
        });
        void flushEvents();
        showToast("error", "Couldn't save this idea. Try again.");
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
        return;
      }

      enqueueEvent({
        type: "combo_save_failed",
        queryText: searchQuery || null,
        page: "home",
        source: "ideas-panel",
        payload: {
          title: idea.title,
          status: response.status,
        },
      });
      void flushEvents();
      showToast("error", "Couldn't save this idea. Try again.");
    } catch (error) {
      enqueueEvent({
        type: "combo_save_failed",
        comboId: idea.id ?? null,
        queryText: searchQuery || null,
        page: "home",
        source: "ideas-panel",
        payload: {
          title: idea.title,
          reason: error instanceof Error ? error.message : "unknown_error",
        },
      });
      void flushEvents();
      showToast("error", "Couldn't save this idea. Check your connection and try again.");
    }
  }, [searchQuery, showToast]);

  const forgeQueryLabel = truncate(searchQuery || "your idea", 28);
  const forgeFoundCount = searchTrace?.mergedCount ?? null;
  const forgeStepLabels = [
    "Parsing intent...",
    forgeFoundCount != null
      ? `Found ${formatCount(forgeFoundCount)} repos matching “${forgeQueryLabel}”`
      : `Finding repos matching “${forgeQueryLabel}”…`,
    forgeFoundCount != null
      ? `Analyzing capabilities across ${formatCount(forgeFoundCount)} repos...`
      : "Analyzing capabilities...",
    "Generating combos...",
  ];
  const forgeSubtitle = forgeFoundCount != null
    ? `Found ${formatCount(forgeFoundCount)} repos. Building blueprints now.`
    : `Searching for “${forgeQueryLabel}”...`;

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
                Turn open-source repos into startup ideas in minutes
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 1.3, type: "spring", stiffness: 120, damping: 18 }}
                className="w-full"
              >
                <SearchBar
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  onSearch={handleSearch}
                  variant="hero"
                  onClear={handleClear}
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.55, duration: 0.5 }}
                className="mt-6 flex max-w-[760px] flex-wrap items-center justify-center gap-2.5"
              >
                {INSPIRATION_CHIPS.map((chip) => (
                  <motion.button
                    key={chip.id}
                    type="button"
                    onClick={() => handleChipClick(chip, INSPIRATION_CHIPS.indexOf(chip) + 1)}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="rounded-full border border-border/60 bg-surface/70 px-4 py-2 text-[13px] font-medium text-fg-secondary transition-colors hover:border-teal/30 hover:bg-teal/10 hover:text-fg"
                  >
                    {chip.text}
                  </motion.button>
                ))}
                <motion.button
                  type="button"
                  onClick={handleDiceClick}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 rounded-full border border-teal/20 bg-teal/10 px-4 py-2 text-[13px] font-semibold text-teal transition-colors hover:border-teal/30 hover:bg-teal/15"
                  aria-label="Surprise me with a random inspiration"
                >
                  <svg aria-hidden="true" className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path d="M12 2 2 7l10 5 10-5-10-5Zm0 10L2 7v10l10 5 10-5V7l-10 5Zm0 0v10" />
                  </svg>
                  Surprise me
                </motion.button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2, duration: 0.8 }}
                className="mt-10 flex items-center gap-8 md:mt-14 md:gap-12"
              >
                <TrustMetric value={formatCount(stats.repoCount)} label="Repos indexed" delay={1.6} />
                <VerticalDivider />
                <TrustMetric value={formatLatency(stats.p50LatencyMs)} label="P50 latency" delay={1.7} />
                <VerticalDivider />
                <TrustMetric value={formatCount(stats.comboCount)} label="Ideas generated" delay={1.8} />
              </motion.div>

              {featuredCombos.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.9, duration: 0.45 }}
                  className="mt-8 w-full max-w-[1040px]"
                >
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal">
                        Featured ideas
                      </p>
                      <h2 className="mt-1 text-xl font-semibold text-fg">
                        Start from a proven blueprint
                      </h2>
                    </div>
                    <p className="max-w-[320px] text-right text-sm text-fg-muted">
                      Pick a featured combo and run your own fresh search from the same prompt.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    {featuredCombos.map((combo) => (
                      <ShowcaseCard
                        key={combo.id ?? combo.title}
                        title={combo.title}
                        thesis={combo.thesis}
                        score={
                          combo.scores
                            ? ((combo.scores.novelty ?? 0) +
                                (combo.scores.composableFit ?? 0) +
                                (combo.scores.accessibilityWedge ?? 0)) / 3
                            : null
                        }
                        tags={combo.capabilities}
                        queryText={combo.queryText}
                        onTry={() => {
                          if (!combo.queryText) {
                            return;
                          }
                          void handleSearch(combo.queryText, "showcase-card");
                        }}
                      />
                    ))}
                  </div>
                </motion.section>
              )}
            </motion.main>
          ) : loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 items-center justify-center px-5 pt-10"
            >
              <ForgeSpinner
                step={forgeStep}
                steps={forgeStepLabels}
                title="Forging ideas..."
                subtitle={forgeSubtitle}
              />
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
                <SearchBar
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  onSearch={handleSearch}
                  loading={loading}
                  variant="compact"
                  onClear={handleClear}
                />
              </div>

              {searchError && (
                <div className="mx-auto w-full max-w-[1200px] rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">
                  {searchError}
                </div>
              )}

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
                        <svg aria-hidden="true" className="size-3.5 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
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
                          onOpen={(meta) => {
                            enqueueEvent({
                              type: "repo_opened",
                              repoSlug: repo.slug,
                              queryText: searchQuery || null,
                              page: "home",
                              source: meta?.source ?? "repos-panel",
                            });
                            void flushEvents();
                            if (traceId) {
                              void fetch(`/api/traces/${traceId}/clicks`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ slug: repo.slug }),
                              });
                            }
                          }}
                        />
                      </motion.div>
                    ))}
                  </motion.div>

                  {repos.length === 0 && !searchError && (
                    <p role="status" aria-live="polite" className="py-8 text-center text-sm text-fg-muted">
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
                        <svg aria-hidden="true" className="size-3.5 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
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
                              ? ((idea.scores.novelty ?? 0) +
                                  (idea.scores.composableFit ?? 0) +
                                  (idea.scores.accessibilityWedge ?? 0)) /
                                3
                              : null
                          }
                          tags={idea.repoSlugs?.slice(0, 3)}
                          steps={idea.steps}
                          demo72h={idea.demo72h}
                          href={idea.id ? `/ideas/${idea.id}` : null}
                          onOpen={(meta) => {
                            markPendingRestore(searchQuery);
                            enqueueEvent({
                              type: "combo_expanded",
                              comboId: idea.id ?? null,
                              queryText: searchQuery || null,
                              page: "home",
                              source: meta?.source ?? "ideas-panel",
                              payload: { title: idea.title },
                            });
                            void flushEvents();
                          }}
                          onSave={() => handleSave(idea)}
                          onStepsViewed={() => {
                            enqueueEvent({
                              type: "combo_steps_viewed",
                              comboId: idea.id ?? null,
                              queryText: searchQuery || null,
                              page: "home",
                              source: "ideas-panel",
                            });
                            void flushEvents();
                          }}
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

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className={`fixed bottom-5 right-5 z-50 max-w-[340px] rounded-2xl border px-4 py-3 text-sm shadow-xl backdrop-blur ${
              toast.kind === "error"
                ? "border-red-500/25 bg-red-500/10 text-red-100"
                : "border-teal/25 bg-teal/10 text-teal-50"
            }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
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
