import { Star } from "lucide-react";
import { starFill } from "@/lib/reviews";

export function formatRating(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

// Pass label={false} only where the parent already names the rating.
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
