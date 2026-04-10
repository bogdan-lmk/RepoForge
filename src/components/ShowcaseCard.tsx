"use client";

import { motion } from "framer-motion";

interface ShowcaseCardProps {
  title: string;
  thesis: string;
  score?: number | null;
  tags?: string[];
  queryText?: string | null;
  onTry?: () => void;
}

export function ShowcaseCard({
  title,
  thesis,
  score,
  tags = [],
  queryText,
  onTry,
}: ShowcaseCardProps) {
  const displayScore = score != null ? (score * 10).toFixed(1) : null;

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="flex h-full flex-col justify-between rounded-3xl border border-border-subtle bg-surface-elevated/70 p-5 backdrop-blur-sm"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal">
              Featured blueprint
            </p>
            <h3 className="mt-2 text-lg font-semibold text-fg">{title}</h3>
          </div>
          {displayScore && (
            <span className="rounded-full bg-teal/10 px-2.5 py-1 text-[12px] font-semibold text-teal">
              {displayScore}
            </span>
          )}
        </div>

        <p className="line-clamp-3 text-[14px] leading-relaxed text-fg-secondary">{thesis}</p>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border/70 bg-surface px-2.5 py-1 text-[11px] text-fg-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onTry}
        disabled={!queryText}
        className="mt-5 flex items-center justify-between rounded-2xl border border-teal/20 bg-teal/10 px-4 py-3 text-left transition-colors hover:border-teal/30 hover:bg-teal/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="text-sm font-medium text-fg">Try this</span>
        <span className="text-sm font-semibold text-teal">Forge →</span>
      </button>
    </motion.div>
  );
}
