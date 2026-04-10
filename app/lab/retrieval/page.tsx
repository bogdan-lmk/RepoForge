import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import {
  compareBenchQueryScores,
  type RetrievalBenchReport,
} from "@/services/eval/retrieval-bench";
import { SEARCH_MODES, type SearchMode } from "@/core/types";

type RetrievalLabPageProps = {
  searchParams?: Promise<{
    baseline?: string;
    candidate?: string;
    status?: string;
  }>;
};

const allowedStatuses = new Set(["all", "improved", "degraded", "unchanged"]);

function isSearchMode(value: string | undefined): value is SearchMode {
  return SEARCH_MODES.includes(value as SearchMode);
}

function buildHref(
  baseline: SearchMode,
  candidate: SearchMode,
  status: string,
) {
  const params = new URLSearchParams({
    baseline,
    candidate,
    status,
  });

  return `/lab/retrieval?${params.toString()}`;
}

async function loadReport() {
  try {
    const filePath = path.resolve("artifacts/evals/retrieval-bench/latest-summary.json");
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as RetrievalBenchReport;
  } catch {
    return null;
  }
}

export default async function RetrievalLabPage({
  searchParams,
}: RetrievalLabPageProps) {
  const report = await loadReport();
  if (!report) {
    return (
      <main className="min-h-screen bg-[var(--color-bg)] px-6 py-16 text-[var(--color-fg)]">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-teal)]">
            Internal Retrieval Lab
          </p>
          <h1 className="mt-4 text-3xl font-semibold">No retrieval bench artifact found</h1>
          <p className="mt-3 text-sm text-[var(--color-fg-secondary)]">
            Run <code className="rounded bg-black/30 px-2 py-1 font-mono">npm run eval:retrieval</code>
            {" "}to generate <code className="rounded bg-black/30 px-2 py-1 font-mono">artifacts/evals/retrieval-bench/latest-summary.json</code>.
          </p>
        </div>
      </main>
    );
  }

  const params = (await searchParams) ?? {};
  const modes = report.runs.map((run) => run.mode);
  const fallbackCandidate = modes.find((mode) => mode !== report.baselineMode) ?? report.baselineMode;
  const baseline =
    isSearchMode(params.baseline) && modes.includes(params.baseline)
      ? params.baseline
      : report.baselineMode;
  const candidate =
    isSearchMode(params.candidate) && modes.includes(params.candidate)
      ? params.candidate
      : fallbackCandidate;
  const status = allowedStatuses.has(params.status ?? "")
    ? (params.status as "all" | "improved" | "degraded" | "unchanged")
    : "all";

  const baselineRun = report.runs.find((run) => run.mode === baseline) ?? report.runs[0];
  const candidateRun = report.runs.find((run) => run.mode === candidate) ?? report.runs[1] ?? report.runs[0];
  const queryDeltas = compareBenchQueryScores(baselineRun, candidateRun);
  const filteredDeltas = status === "all"
    ? queryDeltas
    : queryDeltas.filter((delta) => delta.status === status);

  const counts = {
    improved: queryDeltas.filter((delta) => delta.status === "improved").length,
    degraded: queryDeltas.filter((delta) => delta.status === "degraded").length,
    unchanged: queryDeltas.filter((delta) => delta.status === "unchanged").length,
  };
  const selectedComparison =
    report.comparisons.find((comparison) =>
      comparison.baseline === baseline && comparison.candidate === candidate
    ) ?? null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.18),_transparent_42%),linear-gradient(180deg,#09090b_0%,#0f1115_100%)] px-6 py-10 text-[var(--color-fg)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-teal)]">
            Internal Retrieval Lab
          </p>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight">Retrieval Bench</h1>
              <p className="mt-3 max-w-3xl text-sm text-[var(--color-fg-secondary)]">
                Internal comparison view over the latest retrieval bench artifact. The
                GitHub fallback mode is intentionally excluded from selectable modes after
                being marked <span className="font-semibold text-rose-300">kill</span> for latency.
              </p>
            </div>
            <div className="text-sm text-[var(--color-fg-secondary)]">
              <div>Run: <span className="font-mono text-[var(--color-fg)]">{report.runId}</span></div>
              <div>Generated: <span className="font-mono text-[var(--color-fg)]">{report.generatedAt}</span></div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-fg-muted)]">
              Mode Pair
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-3 text-sm font-medium text-[var(--color-fg-secondary)]">Baseline</div>
                <div className="flex flex-wrap gap-2">
                  {modes.map((mode) => (
                    <Link
                      key={`baseline-${mode}`}
                      href={buildHref(mode, candidate, status)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${
                        baseline === mode
                          ? "border-[var(--color-teal)] bg-[var(--color-teal-muted)] text-[var(--color-fg)]"
                          : "border-white/10 bg-white/5 text-[var(--color-fg-secondary)] hover:border-white/20 hover:text-[var(--color-fg)]"
                      }`}
                    >
                      {mode}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-3 text-sm font-medium text-[var(--color-fg-secondary)]">Candidate</div>
                <div className="flex flex-wrap gap-2">
                  {modes.map((mode) => (
                    <Link
                      key={`candidate-${mode}`}
                      href={buildHref(baseline, mode, status)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${
                        candidate === mode
                          ? "border-[var(--color-teal)] bg-[var(--color-teal-muted)] text-[var(--color-fg)]"
                          : "border-white/10 bg-white/5 text-[var(--color-fg-secondary)] hover:border-white/20 hover:text-[var(--color-fg)]"
                      }`}
                    >
                      {mode}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-fg-muted)]">
              Decision Snapshot
            </p>
            {selectedComparison ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-fg-secondary)]">Decision</span>
                  <span className="rounded-full border border-white/10 px-3 py-1 font-medium text-[var(--color-fg)]">
                    {selectedComparison.decision}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-fg-secondary)]">MRR delta</span>
                  <span className="font-mono">{selectedComparison.mrrDeltaPct}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-fg-secondary)]">nDCG delta</span>
                  <span className="font-mono">{selectedComparison.ndcgDeltaPct}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-fg-secondary)]">Latency delta</span>
                  <span className="font-mono">{selectedComparison.latencyDeltaPct}%</span>
                </div>
                <div className="pt-2 text-[var(--color-fg-secondary)]">
                  {selectedComparison.notes.join(" ")}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--color-fg-secondary)]">
                Direct comparison is only available for baseline-to-candidate pairs recorded in the artifact.
              </p>
            )}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--color-fg-muted)]">Queries</div>
            <div className="mt-3 text-3xl font-semibold">{queryDeltas.length}</div>
          </div>
          <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/8 p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-emerald-200/70">Improved</div>
            <div className="mt-3 text-3xl font-semibold text-emerald-100">{counts.improved}</div>
          </div>
          <div className="rounded-3xl border border-rose-500/20 bg-rose-500/8 p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-rose-200/70">Degraded</div>
            <div className="mt-3 text-3xl font-semibold text-rose-100">{counts.degraded}</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--color-fg-muted)]">Unchanged</div>
            <div className="mt-3 text-3xl font-semibold">{counts.unchanged}</div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-black/20 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Per-query deltas</h2>
              <p className="mt-2 text-sm text-[var(--color-fg-secondary)]">
                Composite score = 0.5 × MRR + 0.4 × nDCG@10 + 0.1 × P@5.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {["all", "improved", "degraded", "unchanged"].map((value) => (
                <Link
                  key={value}
                  href={buildHref(baseline, candidate, value)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    status === value
                      ? "border-[var(--color-teal)] bg-[var(--color-teal-muted)] text-[var(--color-fg)]"
                      : "border-white/10 bg-white/5 text-[var(--color-fg-secondary)] hover:border-white/20 hover:text-[var(--color-fg)]"
                  }`}
                >
                  {value}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
                <tr>
                  <th className="px-4 py-2">Query</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Delta</th>
                  <th className="px-4 py-2">First relevant</th>
                  <th className="px-4 py-2">Top result shift</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeltas.map((delta) => (
                  <tr key={delta.queryId} className="rounded-2xl bg-white/[0.03]">
                    <td className="rounded-l-2xl px-4 py-3 align-top">
                      <div className="font-medium text-[var(--color-fg)]">{delta.query}</div>
                      <div className="mt-1 font-mono text-xs text-[var(--color-fg-muted)]">
                        {delta.queryId}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                          delta.status === "improved"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                            : delta.status === "degraded"
                              ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                              : "border-white/10 bg-white/5 text-[var(--color-fg-secondary)]"
                        }`}
                      >
                        {delta.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono align-top">
                      {delta.delta > 0 ? "+" : ""}
                      {delta.delta}
                    </td>
                    <td className="px-4 py-3 font-mono align-top text-[var(--color-fg-secondary)]">
                      {String(delta.baselineRank ?? "miss")} → {String(delta.candidateRank ?? "miss")}
                    </td>
                    <td className="rounded-r-2xl px-4 py-3 align-top text-[var(--color-fg-secondary)]">
                      <div>{delta.baselineTopSlug ?? "(none)"}</div>
                      <div className="mt-1 text-[var(--color-fg-muted)]">→ {delta.candidateTopSlug ?? "(none)"}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
