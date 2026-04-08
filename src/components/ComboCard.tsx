"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { saveButton } from "@/lib/motion";

interface ComboCardProps {
  title: string;
  description?: string | null;
  tags?: string[];
  scores?: {
    novelty?: number | null;
    composableFit?: number | null;
    accessibilityWedge?: number | null;
    timeToDemo?: number | null;
    categoryUpside?: number | null;
    narrativeClarity?: number | null;
  } | null;
  saved?: boolean;
  onSave?: () => void;
}

export function ComboCard({
  title,
  description,
  tags,
  scores,
  saved,
  onSave,
}: ComboCardProps) {
  const [justSaved, setJustSaved] = useState(false);

  const avgScore = scores
    ? (
        [
          scores.novelty,
          scores.composableFit,
          scores.accessibilityWedge,
        ].filter((v) => v != null) as number[]
      ).reduce((a, b) => a + b, 0) /
        (
          [
            scores.novelty,
            scores.composableFit,
            scores.accessibilityWedge,
          ].filter((v) => v != null) as number[]
        ).length
    : 0;

  const handleSave = () => {
    setJustSaved(true);
    onSave?.();
    setTimeout(() => setJustSaved(false), 500);
  };

  return (
    <div
      className={cn(
        "flex gap-5 rounded-[14px] border border-border-subtle bg-surface-elevated p-5",
      )}
    >
      <div className="flex flex-1 flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 items-center rounded-md bg-teal-muted px-2 text-[11px] font-medium text-teal">
            Idea
          </span>
          {saved && (
            <span className="flex h-6 items-center rounded-md bg-teal-muted px-2 text-[11px] font-medium text-teal">
              ★ Saved
            </span>
          )}
        </div>

        <h3 className="text-[17px] font-semibold text-fg">{title}</h3>

        {description && (
          <p className="text-[13px] leading-relaxed text-fg-muted">{description}</p>
        )}

        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex h-6 items-center rounded-md bg-surface-hover px-2.5 text-[11px] text-fg-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex w-[120px] flex-shrink-0 flex-col items-end gap-3">
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl font-bold text-teal">
            {avgScore ? (avgScore * 10).toFixed(1) : "—"}
          </span>
          <span className="text-[11px] text-fg-muted">avg score</span>
        </div>

        <div className="flex w-full flex-col gap-1">
          <ScoreBar label="Novelty" value={scores?.novelty} />
          <ScoreBar label="Fit" value={scores?.composableFit} />
          <ScoreBar label="Wedge" value={scores?.accessibilityWedge} />
        </div>

        {onSave && (
          <motion.button
            onClick={handleSave}
            {...saveButton}
            className={cn(
              "mt-1 flex items-center gap-1 text-[12px]",
              saved ? "text-teal" : "text-fg-muted",
            )}
          >
            <span className={cn(justSaved && "animate-save-pop")}>
              {saved ? "★" : "☆"}
            </span>
            {saved ? "Saved" : "Save"}
          </motion.button>
        )}
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value?: number | null }) {
  const pct = value != null ? Math.round(value * 100) : 0;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-fg-muted">{label}</span>
        <span className="text-fg-muted">{pct}%</span>
      </div>
      <div className="h-1 w-full rounded-sm bg-surface-hover">
        <div
          className="h-1 rounded-sm bg-teal transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
