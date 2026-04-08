"use client";

import { motion } from "framer-motion";
import { ScoreBar } from "@/components/ScoreBar";
import { cardHover, arrowSlide } from "@/lib/motion";

const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.15 },
  },
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 260, damping: 24 },
  },
} as const;

const slideRight = {
  hidden: { opacity: 0, x: 24 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 200, damping: 22, delay: 0.3 },
  },
} as const;

interface RepoDetailAnimatorProps {
  language: string | null;
  slug: string;
  description: string | null;
  stars: string;
  sourceRank: string;
  capabilities: string[];
  sourceRankRaw: number;
  url: string | null;
}

export function RepoDetailAnimator({
  language,
  slug,
  description,
  stars,
  sourceRank,
  capabilities,
  sourceRankRaw,
  url,
}: RepoDetailAnimatorProps) {
  return (
    <motion.div
      className="flex gap-10 px-20 pt-24 pb-10 md:pt-28"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div className="flex flex-1 flex-col gap-6" variants={fadeUp}>
        <div className="flex flex-col gap-3">
          {language && (
            <motion.span
              className="flex h-[22px] w-fit items-center gap-1.5 rounded-md bg-teal-muted px-2.5 text-[11px] font-medium text-teal"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
            >
              <span className="size-2 rounded-full bg-teal" />
              {language}
            </motion.span>
          )}
          <h1 className="text-[32px] font-semibold leading-tight text-fg">
            {slug}
          </h1>
          <p className="text-[15px] leading-relaxed text-fg-secondary">
            {description}
          </p>
        </div>

        <div className="flex gap-6">
          <Stat value={stars} label="stars" />
          <Stat value={sourceRank} label="source rank" />
        </div>

        {capabilities.length > 0 && (
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium text-fg-secondary">
              Capabilities
            </span>
            <div className="flex flex-wrap gap-2">
              {capabilities.map((cap, i) => (
                <motion.span
                  key={cap}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    delay: 0.5 + i * 0.04,
                    type: "spring",
                    stiffness: 350,
                    damping: 22,
                  }}
                  className="flex h-7 items-center rounded-lg border border-border-subtle bg-surface-elevated px-3 text-[12px] text-fg-muted"
                >
                  {cap}
                </motion.span>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      <motion.div
        className="flex w-[360px] flex-shrink-0 flex-col gap-5"
        variants={slideRight}
      >
        <motion.div
          className="flex flex-col gap-4 rounded-[14px] border border-border-subtle bg-surface-elevated p-5"
          whileHover={{
            borderColor: "rgba(20, 184, 166, 0.2)",
            transition: { duration: 0.2 },
          }}
        >
          <span className="text-sm font-medium text-fg-secondary">
            Source Rank
          </span>
          <motion.span
            className="text-[48px] font-bold leading-none text-teal"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, type: "spring", stiffness: 200, damping: 15 }}
          >
            {sourceRankRaw}
          </motion.span>
          <ScoreBar label="Rank" value={sourceRankRaw} maxValue={100} />
        </motion.div>

        {url && (
          <motion.a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-[14px] border border-border-subtle bg-surface-elevated p-4 transition-colors hover:bg-surface-hover"
            whileHover={{
              x: 3,
              borderColor: "rgba(20, 184, 166, 0.2)",
              transition: { type: "spring", stiffness: 300, damping: 20 },
            }}
            whileTap={{ scale: 0.98 }}
          >
            <svg
              className="size-5 text-fg"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-[13px] font-medium text-fg">
                View on GitHub
              </span>
              <span className="text-[11px] text-fg-muted">{url}</span>
            </div>
            <motion.svg
              className="size-4 text-fg-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              {...arrowSlide}
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
            </motion.svg>
          </motion.a>
        )}
      </motion.div>
    </motion.div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xl font-semibold text-fg">{value}</span>
      <span className="text-xs text-fg-muted">{label}</span>
    </div>
  );
}
