"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { saveButton } from "@/lib/motion";

interface IdeaCardProps {
  index: number;
  title: string;
  description?: string | null;
  score?: number | null;
  tags?: string[];
  steps?: string[];
  repoSlugs?: string[];
  demo72h?: string | null;
  saved?: boolean;
  href?: string | null;
  onSave?: () => void;
  onOpen?: (meta?: { source?: string }) => void;
  onStepsViewed?: () => void;
}

function ScoreRing({ score, size = 42 }: { score: number; size?: number }) {
  const pct = Math.round(score * 100);
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const hue = pct >= 70 ? "teal" : pct >= 40 ? "#EAB308" : "#71717A";
  const display = (score * 10).toFixed(1);

  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={hue} strokeWidth={3} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <span className="absolute font-mono text-[11px] font-bold text-fg">{display}</span>
    </div>
  );
}

export function IdeaCard({
  index,
  title,
  description,
  score,
  tags,
  steps,
  demo72h,
  saved,
  href,
  onSave,
  onOpen,
  onStepsViewed,
}: IdeaCardProps) {
  const [justSaved, setJustSaved] = useState(false);
  const stepsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!stepsRef.current || !onStepsViewed) return;
    const el = stepsRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onStepsViewed();
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onStepsViewed]);

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setJustSaved(true);
    onSave?.();
    setTimeout(() => setJustSaved(false), 500);
  };

  const inner = (
    <>
      <div className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-teal/60 via-teal/20 to-transparent" />

      <div className="flex flex-1 flex-col gap-3 pl-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 items-center rounded-md bg-teal-muted px-2 text-[10px] font-bold uppercase tracking-wider text-teal">
            #{index + 1}
          </span>
          {tags && tags.slice(0, 2).map((tag) => (
            <span key={tag} className="flex h-5 items-center rounded-md bg-surface-hover px-2 text-[10px] text-fg-muted">
              {tag.split("/").pop()}
            </span>
          ))}
        </div>

        <h3 className="text-[15px] font-semibold leading-snug text-fg">{title}</h3>

        {description && (
          <p className="line-clamp-2 text-[13px] leading-relaxed text-fg-muted">{description}</p>
        )}

        {steps && steps.length > 0 && (
          <div ref={stepsRef} className="rounded-xl border border-teal/10 bg-teal/[0.04] px-3 py-2.5">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-teal">
              <span>{steps.length} steps to build</span>
            </div>
            <p className="line-clamp-2 text-[12px] leading-relaxed text-fg-secondary">
              1. {steps[0]}
            </p>
            {steps.length > 1 && (
              <p className="mt-1 text-[11px] text-fg-muted">
                +{steps.length - 1} more steps in the full idea
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          {demo72h ? (
            <motion.span
              className="flex items-center gap-1 text-[12px] font-medium text-teal"
              whileHover={{ x: 2 }}
            >
              72h demo plan
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </motion.span>
          ) : (
            <span />
          )}

          <motion.button
            onClick={handleSave}
            {...saveButton}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px]",
              "transition-colors",
              saved ? "bg-teal-muted text-teal" : "text-fg-muted hover:bg-surface-hover",
            )}
          >
            <svg
              className={cn("size-3.5", justSaved && "animate-save-pop")}
              viewBox="0 0 24 24"
              fill={saved ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            {saved ? "Saved" : "Save"}
          </motion.button>
        </div>
      </div>

      {score != null && (
        <div className="flex flex-col items-center gap-1">
          <ScoreRing score={score} />
          <span className="text-[9px] uppercase tracking-wider text-fg-muted">score</span>
        </div>
      )}
    </>
  );

  const cardClasses = cn(
    "group relative flex gap-4 overflow-hidden rounded-2xl border border-border-subtle bg-surface-elevated/70 p-5 backdrop-blur-sm",
    "transition-all hover:border-teal/15",
    href && "cursor-pointer hover:border-teal/25 hover:shadow-lg hover:shadow-teal/5",
  );

  if (href) {
    return (
      <Link href={href} className={cardClasses} onClick={() => onOpen?.()}>
        {inner}
      </Link>
    );
  }

  return <div className={cardClasses}>{inner}</div>;
}
