"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { buttonSpring, ctaGlow } from "@/lib/motion";

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({
  title = "No ideas yet",
  description = "Search for GitHub repos and we'll help you turn them into product ideas",
  actionLabel = "Start searching",
  actionHref = "/",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-5">
      <motion.div
        className="flex size-16 items-center justify-center rounded-2xl bg-surface-elevated"
        animate={{
          y: [0, -4, 0],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <svg
          className="size-7 text-fg-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
          <path d="M9 18h6" />
          <path d="M10 22h4" />
        </svg>
      </motion.div>

      <h2 className="text-[22px] font-medium text-fg">{title}</h2>
      <p className="whitespace-pre-line text-center text-sm leading-relaxed text-fg-muted">
        {description}
      </p>

      <motion.div
        whileHover={{
          scale: 1.03,
          boxShadow: "0 0 20px 4px rgba(20, 184, 166, 0.25), 0 0 40px 8px rgba(20, 184, 166, 0.1)",
          transition: { duration: 0.3, type: "spring", stiffness: 400, damping: 20 },
        }}
        whileTap={{
          scale: 0.96,
          boxShadow: "0 0 8px 2px rgba(20, 184, 166, 0.15)",
          transition: { type: "spring", stiffness: 500, damping: 25 },
        }}
      >
        <Link
          href={actionHref}
          className={cn(
            "flex h-10 items-center gap-2 rounded-[10px] bg-teal px-6",
            "text-[13px] font-semibold text-[#0A0A0A]",
          )}
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          {actionLabel}
        </Link>
      </motion.div>
    </div>
  );
}
