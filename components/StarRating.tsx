import { Star } from "lucide-react";
import { starFill } from "@/lib/reviews";

/** "4" for a whole rating, "4,5" for an average — the way the rest of the page prints it. */
export function formatRating(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

/**
 * Five stars, read-only. Rendered on the server wherever a rating is shown, so it stays out of the
 * client bundle for the grid — `RatingInput` is the interactive counterpart.
 *
 * The stars themselves are decoration and hidden from assistive tech; the rating is read from a
 * visually hidden `label` beside them, "Оценка 4 из 5" by default. It used to be the whole
 * component that was `aria-hidden`, which was right only where a number stood next to it — and in
 * a review list, or on a card, nothing did, so a screen reader heard the review count alone.
 * Pass `label={false}` where the parent already names the rating (RatingSummary's link label).
 *
 * A half star is drawn by clipping a filled star over an empty one rather than by a half-star glyph:
 * lucide has no half-star, and rounding 3.5 to 4 would overstate every product sitting on a .5.
 */
export default function StarRating({
  average,
  size = "sm",
  className,
  label,
}: {
  average: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string | false;
}) {
  const px = size === "lg" ? "size-6" : size === "md" ? "size-5" : "size-4";
  const text = label === false ? null : (label ?? `Оценка ${formatRating(average)} из 5`);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className ?? ""}`}>
      {text && <span className="sr-only">{text}</span>}
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = starFill(average, star);
        if (fill === "empty") return <Star key={star} className={`${px} text-gray-300`} aria-hidden />;
        if (fill === "full") return <Star key={star} className={`${px} text-yellow-500 fill-yellow-500`} aria-hidden />;
        return (
          <span key={star} className={`relative ${px}`} aria-hidden>
            <Star className={`${px} text-gray-300`} />
            <span className="absolute inset-0 overflow-hidden w-1/2">
              <Star className={`${px} text-yellow-500 fill-yellow-500`} />
            </span>
          </span>
        );
      })}
    </span>
  );
}
