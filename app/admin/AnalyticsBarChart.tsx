"use client";

import { cn } from "@/lib/cn";

const PLOT_HEIGHT = 176;
const MAX_TICKS = 7;

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)} млн`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} тыс`;
  return String(Math.round(value));
}

export type BarPoint = {
  key: string;
  label: string;
  value: number;
  detail: string;
  muted?: boolean;
};

export default function AnalyticsBarChart({ points: series, tickEvery }: { points: BarPoint[]; tickEvery?: number }) {
  const max = Math.max(...series.map((p) => p.value), 0);
  const tickStep = tickEvery ?? Math.max(1, Math.ceil(series.length / MAX_TICKS));
  const isTick = (index: number) => (series.length - 1 - index) % tickStep === 0;

  return (
    <div className="flex gap-2">
      <div
        className="relative w-12 shrink-0 text-[10px] text-gray-500 text-right tabular-nums"
        style={{ height: PLOT_HEIGHT }}
      >
        {[1, 0.5, 0].map((fraction) => (
          <span
            key={fraction}
            className="absolute right-0 -translate-y-1/2"
            style={{ top: `${(1 - fraction) * 100}%` }}
          >
            {compact(max * fraction)}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="min-w-[440px]">
          <div className="relative" style={{ height: PLOT_HEIGHT }}>
            {[0, 0.5, 1].map((fraction) => (
              <div
                key={fraction}
                className="absolute inset-x-0 border-t border-gray-100"
                style={{ top: `${fraction * 100}%` }}
              />
            ))}

            <div className="absolute inset-0 flex items-end gap-[2px]">
              {series.map((point, index) => {
                const height = max > 0 ? (point.value / max) * 100 : 0;
                const edge = index < 2 ? "start" : index > series.length - 3 ? "end" : "center";
                return (
                  <div
                    key={point.key}
                    // Focusable: the tooltip is the only place the exact value lives.
                    tabIndex={0}
                    aria-label={`${point.label}: ${point.detail}`}
                    className="group relative flex h-full flex-1 items-end outline-none"
                  >
                    <div
                      className={cn(
                        "w-full rounded-t transition-colors",
                        point.value <= 0
                          ? "bg-gray-200"
                          : point.muted
                            ? "bg-gray-300 group-hover:bg-gray-400"
                            : "bg-green-700/80 group-hover:bg-green-700",
                      )}
                      style={{ height: point.value > 0 ? `max(2px, ${height}%)` : 2 }}
                    />
                    <div
                      className={cn(
                        "pointer-events-none absolute top-0 z-10 hidden w-max rounded-lg bg-gray-900 px-2 py-1.5 text-[11px] leading-tight text-white shadow-lg group-hover:block group-focus:block",
                        edge === "center" && "left-1/2 -translate-x-1/2",
                        edge === "start" && "left-0",
                        edge === "end" && "right-0",
                      )}
                    >
                      <div className="font-medium">{point.label}</div>
                      <div className="text-gray-300 tabular-nums">{point.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-1.5 flex gap-[2px]">
            {series.map((point, index) => (
              <div
                key={point.key}
                className={cn(
                  "min-w-0 flex-1 text-[10px] whitespace-nowrap text-gray-500",
                  index === 0 ? "text-left" : index === series.length - 1 ? "text-right" : "text-center",
                )}
              >
                {isTick(index) ? point.label : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
