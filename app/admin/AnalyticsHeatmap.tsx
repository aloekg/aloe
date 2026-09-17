"use client";

import { useState } from "react";
import type { HeatmapInsight } from "@/lib/analytics-insights";
import { cn } from "@/lib/cn";

/**
 * Orders by weekday × hour, Bishkek time. Magnitude, so one hue light → dark; four steps plus zero is as many
 * as the eye separates reliably in a grid, and zero gets its own neutral so "never" does not read as
 * "a little".
 *
 * The hovered cell is spelled out in a line above the grid rather than in 168 separate tooltips, and
 * the peak is written as text — the one conclusion a reader needs does not depend on telling two
 * greens apart.
 */

export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const WEEKDAYS_LONG = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];

/**
 * Starts at green-500, not a pale tint: checked with the dataviz palette validator, anything lighter
 * falls under 2:1 against the white card and a quiet hour becomes indistinguishable from none.
 */
const STEPS = ["bg-green-500", "bg-green-600", "bg-green-700", "bg-green-900"];

function stepFor(value: number, max: number): string {
  if (value === 0 || max === 0) return "bg-gray-100";
  return STEPS[Math.min(STEPS.length - 1, Math.floor((value / max) * STEPS.length - 1e-9))];
}

function hours(hour: number): string {
  return `${hour}:00–${(hour + 1) % 24}:00`;
}

function ordersWord(n: number): string {
  const tens = n % 100;
  const ones = n % 10;
  if (tens >= 11 && tens <= 14) return "заказов";
  if (ones === 1) return "заказ";
  if (ones >= 2 && ones <= 4) return "заказа";
  return "заказов";
}

export default function AnalyticsHeatmap({ heatmap }: { heatmap: HeatmapInsight }) {
  const [hovered, setHovered] = useState<{ weekday: number; hour: number } | null>(null);
  const { cells, max, peak } = heatmap;

  const readout = hovered
    ? `${WEEKDAYS_LONG[hovered.weekday]}, ${hours(hovered.hour)} — ${cells[hovered.weekday][hovered.hour]} ${ordersWord(cells[hovered.weekday][hovered.hour])}`
    : peak
      ? `Пик: ${WEEKDAYS_LONG[peak.weekday]}, ${hours(peak.hour)} — ${peak.orders} ${ordersWord(peak.orders)}`
      : "Заказов нет";

  return (
    <div>
      <p className="mb-2 h-4 text-xs text-gray-600" aria-live="polite">
        {readout}
      </p>

      <div className="overflow-x-auto">
        <div className="min-w-[520px]" role="img" aria-label={`Заказы по дням недели и часам. ${readout}`}>
          {cells.map((row, weekday) => (
            <div key={weekday} className="mb-[2px] flex items-center gap-[2px]">
              <span className="w-6 shrink-0 text-[10px] text-gray-400">{WEEKDAYS[weekday]}</span>
              {row.map((value, hour) => (
                <div
                  key={hour}
                  onMouseEnter={() => setHovered({ weekday, hour })}
                  onMouseLeave={() => setHovered(null)}
                  className={cn(
                    "h-5 flex-1 rounded-[3px]",
                    stepFor(value, max),
                    hovered?.weekday === weekday && hovered.hour === hour && "ring-2 ring-gray-900 ring-offset-1",
                  )}
                />
              ))}
            </div>
          ))}
          <div className="flex gap-[2px] pl-[26px]">
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour} className="flex-1 text-center text-[10px] text-gray-400">
                {hour % 3 === 0 ? hour : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-gray-500">
        <span>нет</span>
        <span className="size-3 rounded-[3px] bg-gray-100" />
        <span className="ml-2">меньше</span>
        {STEPS.map((step) => (
          <span key={step} className={cn("size-3 rounded-[3px]", step)} />
        ))}
        <span>больше</span>
      </div>
    </div>
  );
}
