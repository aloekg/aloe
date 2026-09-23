import { Star } from "lucide-react";
import { starFill } from "@/lib/reviews";

/**
 * Five stars, read-only. Rendered on the server wherever a rating is shown, so it stays out of the
 * client bundle for the grid — `RatingInput` is the interactive counterpart.
 *
 * A half star is drawn by clipping a filled star over an empty one rather than by a half-star glyph:
 * lucide has no half-star, and rounding 3.5 to 4 would overstate every product sitting on a .5.
 */
export default function StarRating({
  average,
  size = "sm",
  className,
}: {
  average: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const px = size === "lg" ? "size-6" : size === "md" ? "size-5" : "size-4";
  return (
    <span className={`inline-flex items-center gap-0.5 ${className ?? ""}`} aria-hidden>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = starFill(average, star);
        if (fill === "empty") return <Star key={star} className={`${px} text-gray-300`} />;
        if (fill === "full") return <Star key={star} className={`${px} text-yellow-500 fill-yellow-500`} />;
        return (
          <span key={star} className={`relative ${px}`}>
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
