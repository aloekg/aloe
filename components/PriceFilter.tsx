"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MAX_PRICE, parsePriceRange, type PriceRange } from "@/lib/page-params";

const APPLY_DELAY_MS = 500;

const inputCls =
  // text-base below md stops iOS zooming on focus; border-gray-500, not 300, for contrast.
  "w-20 md:w-24 min-w-0 text-base md:text-sm border border-gray-500 rounded-lg px-2 py-1.5 bg-white text-gray-700 " +
  "focus:outline-none focus:ring-1 focus:ring-green-700 focus:border-green-700 " +
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const toInput = (n: number | null) => (n == null ? "" : String(n));

// No link here: a filter control must not mint a crawlable URL.
export default function PriceFilter({
  value,
  onChange,
  bounds,
  className,
}: {
  value: PriceRange;
  onChange: (range: PriceRange) => void;
  bounds?: { min: number; max: number } | null;
  className?: string;
}) {
  const [min, setMin] = useState(() => toInput(value.min));
  const [max, setMax] = useState(() => toInput(value.max));
  const [applied, setApplied] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idBase = useId();

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
      // Skip no-op emits: on /search each one is a navigation to the URL already open.
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

  const inverted = min !== "" && max !== "" && Number(min) > Number(max);
  const errorId = `${idBase}-error`;

  const common = {
    type: "number" as const,
    inputMode: "numeric" as const,
    min: 0,
    max: MAX_PRICE,
    step: 1,
    className: inputCls,
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <span className="text-sm text-gray-500 whitespace-nowrap">Цена:</span>
      <input
        {...common}
        aria-label="Цена от"
        aria-invalid={inverted || undefined}
        aria-describedby={inverted ? errorId : undefined}
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
        aria-invalid={inverted || undefined}
        aria-describedby={inverted ? errorId : undefined}
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
      {inverted && (
        <p id={errorId} role="alert" className="basis-full text-xs text-red-600">
          «От» больше, чем «до» — диапазон не применён
        </p>
      )}
    </div>
  );
}
