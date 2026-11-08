import { formatNumber } from '../utils/format';

export interface BarDatum {
  label: string;
  value: number;
  secondary?: number;
}

/** Ranked horizontal bars: label + value, bar length relative to the largest value. */
export function BarList({ data, valueLabel, secondaryLabel, max = 8 }: { data: BarDatum[]; valueLabel: string; secondaryLabel?: string; max?: number }) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const shown = sorted.slice(0, max);
  const rest = sorted.slice(max);
  const top = Math.max(1, ...shown.map((d) => d.value));
  return (
    <div>
      <div className="mb-2 flex justify-between text-[11px] font-medium tracking-wide text-muted uppercase">
        <span>Name</span>
        <span>
          {valueLabel}
          {secondaryLabel && <span className="ml-3 normal-case">{secondaryLabel}</span>}
        </span>
      </div>
      <ul className="space-y-1.5">
        {shown.map((d) => (
          <li key={d.label} className="relative">
            <div className="absolute inset-y-0 left-0 rounded-md bg-blue-100/70" style={{ width: `${Math.max(2, (d.value / top) * 100)}%` }} />
            <div className="relative flex items-center justify-between gap-3 px-2.5 py-1.5 text-sm">
              <span className="truncate text-ink" title={d.label}>
                {d.label || <em className="text-muted">Not set</em>}
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold text-ink">{formatNumber(d.value)}</span>
                {d.secondary !== undefined && <span className="ml-3 inline-block min-w-8 text-right text-muted">{formatNumber(d.secondary)}</span>}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {rest.length > 0 && (
        <p className="mt-2 px-2.5 text-xs text-muted">
          + {rest.length} more ({formatNumber(rest.reduce((s, d) => s + d.value, 0))} {valueLabel.toLowerCase()})
        </p>
      )}
    </div>
  );
}
