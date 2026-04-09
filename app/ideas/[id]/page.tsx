"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Nav } from "@/components/Nav";
import { AuroraBackground } from "@/components/AuroraBackground";
import { CursorGlow } from "@/components/CursorGlow";
import { ScoreBar } from "@/components/ScoreBar";
import { TagBadge } from "@/components/TagBadge";

interface ComboDetail {
  id: number;
  title: string;
  thesis: string;
  formula: string | null;
  repoSlugs: string[];
  repoRoles: Record<string, string>;
  steps: string[];
  recommendedShell: string;
  whatIsBeingCombined: string | null;
  capabilities: string[];
  supportingPrimitives: string[];
  whyFit: string | null;
  useCase: string | null;
  whyBetterThanSingle: string | null;
  firstUser: string | null;
  demo72h: string | null;
  keyRisks: string[];
  scores: {
    novelty?: number | null;
    composableFit?: number | null;
    accessibilityWedge?: number | null;
    timeToDemo?: number | null;
    categoryUpside?: number | null;
    narrativeClarity?: number | null;
  } | null;
  saved: boolean;
  queryText: string | null;
  createdAt: string;
}

export default function IdeaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [idea, setIdea] = useState<ComboDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const id = params.id as string;
    fetch(`/api/combos/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data) {
          setIdea(res.data);
          setSaved(res.data.saved);
        }
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleToggleSave = async () => {
    if (!idea) return;
    const res = await fetch(`/api/combos/${idea.id}`, { method: "PATCH" });
    if (res.ok) {
      const data = await res.json();
      setSaved(data.data.saved);
    }
  };

  if (loading) {
    return (
      <div className="relative flex min-h-screen flex-col">
        <AuroraBackground />
        <CursorGlow />
        <div className="relative z-10 flex min-h-screen flex-col">
          <Nav />
          <div className="flex flex-1 items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-2 border-teal/30 border-t-teal" />
          </div>
        </div>
      </div>
    );
  }

  if (!idea) {
    return (
      <div className="relative flex min-h-screen flex-col">
        <AuroraBackground />
        <CursorGlow />
        <div className="relative z-10 flex min-h-screen flex-col">
          <Nav />
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <h2 className="text-xl font-semibold text-fg">Idea not found</h2>
            <Link href="/" className="text-sm text-teal hover:underline">← Back to search</Link>
          </div>
        </div>
      </div>
    );
  }

  const scores = idea.scores ?? {};
  const avgScore = [scores.novelty, scores.composableFit, scores.accessibilityWedge]
    .filter((v) => v != null) as number[];
  const avg = avgScore.length ? avgScore.reduce((a, b) => a + b, 0) / avgScore.length : null;

  return (
    <div className="relative flex min-h-screen flex-col">
      <AuroraBackground />
      <CursorGlow />
      <div className="relative z-10 flex min-h-screen flex-col">
        <Nav />

        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-1 flex-col gap-6 px-4 py-24 md:px-6 md:py-28"
        >
          <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6">

            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 self-start text-[13px] text-fg-muted transition-colors hover:text-teal"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
              <div className="flex flex-1 flex-col gap-6">

                <div className="rounded-2xl border border-border-subtle bg-surface-elevated/70 p-6 backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 items-center rounded-md bg-teal-muted px-2.5 text-[11px] font-bold text-teal">
                          Combo Idea
                        </span>
                        {idea.recommendedShell && (
                          <TagBadge label={idea.recommendedShell} variant="teal" />
                        )}
                      </div>
                      <h1 className="text-2xl font-bold leading-tight text-fg md:text-3xl">
                        {idea.title}
                      </h1>
                    </div>
                    <motion.button
                      onClick={handleToggleSave}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.88 }}
                      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                        saved ? "bg-teal-muted text-teal" : "bg-surface-hover text-fg-muted hover:text-teal"
                      }`}
                    >
                      <svg className="size-4" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                      {saved ? "Saved" : "Save"}
                    </motion.button>
                  </div>

                  <p className="mt-4 text-[15px] leading-relaxed text-fg-secondary">{idea.thesis}</p>

                  {idea.formula && (
                    <div className="mt-4 rounded-lg bg-surface/80 p-3">
                      <code className="font-mono text-[13px] text-teal">{idea.formula}</code>
                    </div>
                  )}
                </div>

                {idea.whatIsBeingCombined && (
                  <Section title="What is being combined">
                    <p className="text-[14px] leading-relaxed text-fg-secondary">{idea.whatIsBeingCombined}</p>
                  </Section>
                )}

                {(idea.capabilities?.length ?? 0) > 0 && (
                  <Section title="Capabilities">
                    <div className="flex flex-wrap gap-2">
                      {idea.capabilities.map((c) => (
                        <TagBadge key={c} label={c} />
                      ))}
                    </div>
                  </Section>
                )}

                {(idea.supportingPrimitives?.length ?? 0) > 0 && (
                  <Section title="Supporting Primitives">
                    <div className="flex flex-wrap gap-2">
                      {idea.supportingPrimitives.map((p) => (
                        <TagBadge key={p} label={p} />
                      ))}
                    </div>
                  </Section>
                )}

                {idea.whyFit && (
                  <Section title="Why it fits">
                    <p className="text-[14px] leading-relaxed text-fg-secondary">{idea.whyFit}</p>
                  </Section>
                )}

                {idea.useCase && (
                  <Section title="Use case">
                    <p className="text-[14px] leading-relaxed text-fg-secondary">{idea.useCase}</p>
                  </Section>
                )}

                {idea.whyBetterThanSingle && (
                  <Section title="Why better than single repo">
                    <p className="text-[14px] leading-relaxed text-fg-secondary">{idea.whyBetterThanSingle}</p>
                  </Section>
                )}

                {idea.firstUser && (
                  <Section title="First user">
                    <p className="text-[14px] leading-relaxed text-fg-secondary">{idea.firstUser}</p>
                  </Section>
                )}

                {(idea.steps?.length ?? 0) > 0 && (
                  <Section title="Steps to build">
                    <ol className="flex flex-col gap-3">
                      {idea.steps.map((step, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-teal/10 font-mono text-[11px] font-bold text-teal">
                            {i + 1}
                          </span>
                          <span className="text-[14px] leading-relaxed text-fg-secondary">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </Section>
                )}

                {idea.demo72h && (
                  <Section title="72h Demo Plan">
                    <p className="whitespace-pre-line text-[14px] leading-relaxed text-fg-secondary">{idea.demo72h}</p>
                  </Section>
                )}

                {(idea.keyRisks?.length ?? 0) > 0 && (
                  <Section title="Key risks">
                    <ul className="flex flex-col gap-2">
                      {idea.keyRisks.map((risk, i) => (
                        <li key={i} className="flex items-start gap-2 text-[14px] text-fg-secondary">
                          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-yellow-500/60" />
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {(idea.repoSlugs?.length ?? 0) > 0 && (
                  <Section title="Repos used">
                    <div className="flex flex-col gap-2">
                      {idea.repoSlugs.map((slug) => (
                        <div key={slug} className="flex items-center gap-2">
                          <svg className="size-4 shrink-0 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          <span className="text-[14px] text-fg-secondary">{slug}</span>
                          {idea.repoRoles?.[slug] && (
                            <span className="text-[11px] text-fg-muted">— {idea.repoRoles[slug]}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>

              <div className="flex w-full flex-col gap-5 lg:w-[300px] lg:shrink-0">
                <div className="rounded-2xl border border-border-subtle bg-surface-elevated/70 p-5 backdrop-blur-sm">
                  <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-fg-muted">Scores</h3>

                  {avg != null && (
                    <div className="mb-4 flex flex-col items-center gap-1 rounded-xl bg-surface/60 p-4">
                      <span className="font-mono text-3xl font-bold text-teal">{(avg * 10).toFixed(1)}</span>
                      <span className="text-[11px] text-fg-muted">overall score</span>
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    <ScoreBar label="Novelty" value={Math.round((scores.novelty ?? 0) * 100)} />
                    <ScoreBar label="Composable Fit" value={Math.round((scores.composableFit ?? 0) * 100)} />
                    <ScoreBar label="Accessibility Wedge" value={Math.round((scores.accessibilityWedge ?? 0) * 100)} />
                    <ScoreBar label="Time to Demo" value={Math.round((scores.timeToDemo ?? 0) * 100)} />
                    <ScoreBar label="Category Upside" value={Math.round((scores.categoryUpside ?? 0) * 100)} />
                    <ScoreBar label="Narrative Clarity" value={Math.round((scores.narrativeClarity ?? 0) * 100)} />
                  </div>
                </div>

                {idea.queryText && (
                  <div className="rounded-2xl border border-border-subtle bg-surface-elevated/70 p-5 backdrop-blur-sm">
                    <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-fg-muted">Original query</h3>
                    <Link
                      href={`/?q=${encodeURIComponent(idea.queryText)}`}
                      className="text-[14px] text-teal hover:underline"
                    >
                      {idea.queryText}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.main>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-elevated/70 p-6 backdrop-blur-sm">
      <h2 className="mb-3 text-[14px] font-semibold uppercase tracking-wider text-fg-muted">{title}</h2>
      {children}
    </div>
  );
}
