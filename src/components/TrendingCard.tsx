"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178C6",
  JavaScript: "#F7DF1E",
  Python: "#3572A5",
  Rust: "#DEA584",
  Go: "#00ADD8",
  Java: "#B07219",
  "C++": "#F34B7D",
  C: "#555555",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Scala: "#DC322F",
  Shell: "#89E051",
  HTML: "#E34C26",
  CSS: "#563D7C",
  Vue: "#41B883",
  Svelte: "#FF3E00",
};

function getLangColor(lang: string | null | undefined): string {
  if (!lang) return "#71717A";
  return LANG_COLORS[lang] ?? "#71717A";
}

interface FeaturedCardProps {
  slug: string;
  description?: string | null;
  language?: string | null;
  stars?: number | null;
  starsDelta30d?: number | null;
  rank: number;
}

export function TrendingFeatured({
  slug,
  description,
  language,
  stars,
  starsDelta30d,
  rank,
}: FeaturedCardProps) {
  const langColor = getLangColor(language);
  const isTop = rank === 1;

  return (
    <motion.div
      whileHover={{
        y: -4,
        borderColor: isTop ? "rgba(20, 184, 166, 0.35)" : "rgba(255,255,255,0.08)",
        transition: { type: "spring", stiffness: 350, damping: 22 },
      }}
      whileTap={{ scale: 0.985 }}
      className={cn(
        "relative flex flex-col justify-between rounded-2xl border p-6",
        "transition-colors",
        isTop
          ? "border-teal/20 bg-gradient-to-br from-teal/[0.07] via-surface-elevated to-surface-elevated"
          : "border-border-subtle bg-surface-elevated hover:bg-surface-hover",
      )}
      style={isTop ? { minHeight: 220 } : { minHeight: 220 }}
    >
      {isTop && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-30"
          style={{
            background: `radial-gradient(ellipse at 30% 20%, rgba(20,184,166,0.12) 0%, transparent 60%)`,
          }}
        />
      )}

      <div className="relative flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: langColor }}
            />
            <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
              {language ?? "—"}
            </span>
          </div>
          <RankBadge rank={rank} />
        </div>

        <Link href={`/repos/${encodeURIComponent(slug)}`} className="group">
          <h3
            className={cn(
              "font-semibold leading-snug text-fg transition-colors group-hover:text-teal",
              isTop ? "text-xl" : "text-lg",
            )}
          >
            {slug}
          </h3>
        </Link>

        {description && (
          <p className="line-clamp-2 text-[13px] leading-relaxed text-fg-secondary">
            {description}
          </p>
        )}
      </div>

      <div className="relative flex items-center gap-4 pt-3">
        {stars != null && (
          <div className="flex items-center gap-1.5">
            <svg className="size-3.5 text-teal" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span className="font-mono text-[13px] font-semibold text-fg">
              {stars.toLocaleString()}
            </span>
          </div>
        )}
        {starsDelta30d != null && starsDelta30d > 0 && (
          <div className="flex items-center gap-1">
            <svg className="size-3 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M7 17l5-5 5 5M7 9l5-5 5 5" />
            </svg>
            <span className="font-mono text-[12px] font-semibold text-teal">
              +{starsDelta30d.toLocaleString()}
            </span>
            <span className="text-[10px] text-fg-muted">/30d</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface TrendingRowProps {
  slug: string;
  description?: string | null;
  language?: string | null;
  stars?: number | null;
  starsDelta30d?: number | null;
  rank: number;
}

export function TrendingRow({
  slug,
  description,
  language,
  stars,
  starsDelta30d,
  rank,
}: TrendingRowProps) {
  const langColor = getLangColor(language);

  return (
    <motion.div
      whileHover={{
        x: 4,
        backgroundColor: "rgba(34, 34, 34, 0.8)",
        transition: { type: "spring", stiffness: 400, damping: 25 },
      }}
      whileTap={{ scale: 0.99 }}
      className="group"
    >
      <Link
        href={`/repos/${encodeURIComponent(slug)}`}
        className="flex items-center gap-5 rounded-xl border border-transparent px-4 py-3.5 transition-colors hover:border-border-subtle"
      >
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg text-[13px] font-bold",
            rank <= 5
              ? "bg-teal-muted text-teal"
              : "bg-surface-elevated text-fg-muted",
          )}
        >
          {rank}
        </span>

        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: langColor }}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[14px] font-medium text-fg transition-colors group-hover:text-teal">
            {slug}
          </span>
          {description && (
            <span className="truncate text-[12px] text-fg-muted">
              {description}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {language && (
            <span className="hidden text-[11px] text-fg-muted sm:block">
              {language}
            </span>
          )}
          {starsDelta30d != null && starsDelta30d > 0 && (
            <div className="flex items-center gap-1">
              <MiniBar delta={starsDelta30d} max={50000} />
              <span className="font-mono text-[12px] font-semibold text-teal">
                +{formatCompact(starsDelta30d)}
              </span>
            </div>
          )}
          {stars != null && (
            <div className="flex items-center gap-1">
              <svg className="size-3 text-fg-muted" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span className="font-mono text-[12px] text-fg-muted">
                {formatCompact(stars)}
              </span>
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const styles: Record<number, string> = {
    1: "bg-gradient-to-br from-teal to-teal-hover text-[#0A0A0A] shadow-[0_0_12px_rgba(20,184,166,0.3)]",
    2: "bg-gradient-to-br from-fg-secondary to-fg-muted text-bg",
    3: "bg-gradient-to-br from-[#CD7F32] to-[#A0522D] text-bg",
  };
  return (
    <span
      className={cn(
        "flex size-7 items-center justify-center rounded-lg text-[12px] font-bold",
        styles[rank] ?? "bg-surface-hover text-fg-muted",
      )}
    >
      {rank}
    </span>
  );
}

function MiniBar({ delta, max }: { delta: number; max: number }) {
  const pct = Math.min((delta / max) * 100, 100);
  return (
    <div className="hidden h-2 w-16 overflow-hidden rounded-full bg-surface-hover sm:block">
      <div
        className="h-full rounded-full bg-gradient-to-r from-teal/60 to-teal transition-all duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}
