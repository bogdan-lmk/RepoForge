"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178C6", JavaScript: "#F7DF1E", Python: "#3572A5",
  Rust: "#DEA584", Go: "#00ADD8", Java: "#B07219", Ruby: "#701516",
  Swift: "#F05138", Kotlin: "#A97BFF", Dart: "#00B4AB",
  HTML: "#E34C26", CSS: "#563D7C", Vue: "#41B883", Svelte: "#FF3E00",
};

interface RepoCardProps {
  slug: string;
  name: string;
  description?: string | null;
  language?: string | null;
  stars?: number | null;
  onOpen?: (meta?: { source?: string }) => void;
}

export function RepoCard({ slug, description, language, stars, onOpen }: RepoCardProps) {
  const langColor = LANG_COLORS[language ?? ""] ?? "#71717A";
  const owner = slug.split("/")[0]?.slice(0, 2).toUpperCase() ?? "R";

  return (
    <motion.div
      whileHover={{ y: -2, transition: { type: "spring", stiffness: 400, damping: 25 } }}
      whileTap={{ scale: 0.98 }}
    >
      <Link
        href={`/repos/${encodeURIComponent(slug)}`}
        onClick={() => onOpen?.()}
        className="group flex items-center gap-4 rounded-xl border border-border-subtle bg-surface-elevated/70 px-4 py-3.5 backdrop-blur-sm transition-all hover:border-teal/15 hover:bg-surface-elevated"
      >
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold"
          style={{ backgroundColor: `${langColor}15`, color: langColor }}
        >
          {owner}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-fg transition-colors group-hover:text-teal">
              {slug}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {language && (
              <span className="flex items-center gap-1 text-[11px] text-fg-muted">
                <span className="size-2 rounded-full" style={{ backgroundColor: langColor }} />
                {language}
              </span>
            )}
            {description && (
              <span className="truncate text-[12px] text-fg-muted/60">
                — {description.slice(0, 60)}{description.length > 60 ? "…" : ""}
              </span>
            )}
          </div>
        </div>

        {stars != null && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-hover/50 px-2.5 py-1">
            <svg className="size-3.5 text-teal" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span className="font-mono text-[12px] font-medium text-fg">
              {stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : stars}
            </span>
          </div>
        )}
      </Link>
    </motion.div>
  );
}
