"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { MAX_RATING, MIN_RATING } from "@/lib/reviews";

const LABELS = ["Ужасно", "Плохо", "Нормально", "Хорошо", "Отлично"];

/**
 * The star picker. A radio group rather than five buttons: a rating is one choice out of five, and
 * that is what lets arrow keys move between them and a screen reader announce "2 из 5" instead of
 * five unrelated toggles.
 */
export default function RatingInput({
  value,
  onChange,
  name,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  name: string;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;

  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" aria-label="Оценка" className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
        {Array.from({ length: MAX_RATING - MIN_RATING + 1 }, (_, i) => i + MIN_RATING).map((star) => (
          <label
            key={star}
            className={disabled ? "cursor-not-allowed" : "cursor-pointer"}
            onMouseEnter={() => !disabled && setHovered(star)}
          >
            <input
              type="radio"
              name={name}
              value={star}
              checked={value === star}
              disabled={disabled}
              onChange={() => onChange(star)}
              className="sr-only peer"
            />
            <Star
              className={`size-8 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-green-700 rounded ${
                star <= shown ? "text-yellow-500 fill-yellow-500" : "text-gray-300"
              }`}
              aria-hidden
            />
            <span className="sr-only">{`${star} из ${MAX_RATING} — ${LABELS[star - 1]}`}</span>
          </label>
        ))}
      </div>
      {/* aria-live so the label is announced as the choice changes, not only on focus. */}
      <span className="text-sm text-gray-500 min-w-20" aria-live="polite">
        {shown ? LABELS[shown - 1] : ""}
      </span>
    </div>
  );
}
