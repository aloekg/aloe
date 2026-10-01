import { StarRating } from "@/components";
import { averageRating, reviewPlural } from "@/lib/reviews";

// A plain anchor on purpose, not a scroll handler: it must work before hydration.
export default function RatingSummary({
  ratingSum,
  ratingCount,
  className,
}: {
  ratingSum: number;
  ratingCount: number;
  className?: string;
}) {
  const average = averageRating(ratingSum, ratingCount);
  if (!average) return null;

  return (
    <a
      href="#reviews"
      className={`inline-flex items-center gap-2 w-fit group ${className ?? ""}`}
      aria-label={`Оценка ${average} из 5, ${ratingCount} ${reviewPlural(ratingCount)}. Перейти к отзывам`}
    >
      <StarRating average={average} label={false} />
      <span className="text-sm font-medium">{average.toFixed(1).replace(".", ",")}</span>
      <span className="text-sm text-gray-500 group-hover:text-green-700 group-hover:underline">
        {ratingCount} {reviewPlural(ratingCount)}
      </span>
    </a>
  );
}
