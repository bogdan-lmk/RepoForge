interface ScoreBarProps {
  label: string;
  value: number;
  maxValue?: number;
}

export function ScoreBar({ label, value, maxValue = 100 }: ScoreBarProps) {
  const pct = Math.round((value / maxValue) * 100);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[12px]">
        <span className="text-fg-muted">{label}</span>
        <span className="font-medium text-fg">{value}</span>
      </div>
      <div className="h-1 w-full rounded-sm bg-surface-hover">
        <div
          className="h-1 rounded-sm bg-teal transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
