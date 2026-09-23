"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_PRICE, parsePriceRange, type PriceRange } from "@/lib/page-params";

/** Long enough that typing "1500" is one update rather than four, short enough to feel immediate. */
const APPLY_DELAY_MS = 500;

const inputCls =
  // text-base below md: iOS zooms the page when a focused input is under 16px, and the zoom does
  // not undo itself. border-gray-500, not 300 — see ACCESSIBILITY.md, where 300 fails at 1.47:1.
  "w-20 md:w-24 min-w-0 text-base md:text-sm border border-gray-500 rounded-lg px-2 py-1.5 bg-white text-gray-700 " +
  "focus:outline-none focus:ring-1 focus:ring-green-700 focus:border-green-700 " +
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const toInput = (n: number | null) => (n == null ? "" : String(n));

/**
 * The price range, as two number boxes and no link — the same rule as SortSelect, so that narrowing
 * a price mints no crawlable URL.
 *
 * Controlled by `value`, but it holds the half-typed text locally: parsing on every keystroke would
 * make "1500" pass through 1, 15 and 150, each a different result set. It reports upward once
 * typing pauses, and immediately on Enter or blur for anyone who does not wait.
 */
export default function PriceFilter({
  value,
  onChange,
  bounds,
  className,
}: {
  value: PriceRange;
  onChange: (range: PriceRange) => void;
  /** The cheapest and dearest of the current set, offered as placeholders. */
  bounds?: { min: number; max: number } | null;
  className?: string;
}) {
  const [min, setMin] = useState(() => toInput(value.min));
  const [max, setMax] = useState(() => toInput(value.max));
  // The range this component last agreed with its parent on, so it can tell its own echo apart from
  // a change made elsewhere — a "Сбросить" in the filter bar, or a Back that restored another URL.
  const [applied, setApplied] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adjusting state during render rather than in an effect: React re-runs this component before
  // committing, so the boxes never paint with the stale range.
  if (value.min !== applied.min || value.max !== applied.max) {
    setApplied(value);
    setMin(toInput(value.min));
    setMax(toInput(value.max));
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const emit = useCallback(
    (nextMin: string, nextMax: string) => {
      if (timer.current) clearTimeout(timer.current);
      const range = parsePriceRange(nextMin, nextMax);
      // Blur fires whether or not anything was typed, and "0100" parses to the range already
      // applied. Reporting either upward would navigate /search to the URL it is already on.
      if (range.min === applied.min && range.max === applied.max) return;
      setApplied(range);
      onChange(range);
    },
    [applied, onChange],
  );

  const schedule = useCallback(
    (nextMin: string, nextMax: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => emit(nextMin, nextMax), APPLY_DELAY_MS);
    },
    [emit],
  );

  const common = {
    type: "number" as const,
    inputMode: "numeric" as const,
    min: 0,
    max: MAX_PRICE,
    step: 1,
    className: inputCls,
  };

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <span className="text-sm text-gray-500 whitespace-nowrap">Цена:</span>
      <input
        {...common}
        aria-label="Цена от"
        placeholder={bounds ? String(bounds.min) : "от"}
        value={min}
        onChange={(e) => {
          setMin(e.target.value);
          schedule(e.target.value, max);
        }}
        onBlur={() => emit(min, max)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            emit(min, max);
          }
        }}
      />
      <span aria-hidden className="text-gray-500">
        —
      </span>
      <input
        {...common}
        aria-label="Цена до"
        placeholder={bounds ? String(bounds.max) : "до"}
        value={max}
        onChange={(e) => {
          setMax(e.target.value);
          schedule(min, e.target.value);
        }}
        onBlur={() => emit(min, max)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            emit(min, max);
          }
        }}
      />
      <span className="text-sm text-gray-500">с</span>
    </div>
  );
}
