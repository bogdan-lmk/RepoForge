import { cn } from "@/lib/utils";

interface TagBadgeProps {
  label: string;
  variant?: "default" | "teal";
}

export function TagBadge({ label, variant = "default" }: TagBadgeProps) {
  return (
    <span
      className={cn(
        "flex h-6 items-center rounded-md px-2.5 text-[11px]",
        variant === "teal"
          ? "bg-teal-muted text-teal"
          : "bg-surface-hover text-fg-muted",
      )}
    >
      {label}
    </span>
  );
}
