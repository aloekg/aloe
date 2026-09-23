import { StarRating } from "@/components";
import { averageRating, reviewPlural } from "@/lib/reviews";

/**
 * The compact rating under a product's title: stars, the average and how many reviews there are,
 * linking down to the reviews section.
 *
 * A plain `<a href="#reviews">`, not a scroll handler. The jump works before hydration and without
 * JavaScript at all, which on the page a customer lands on from a WhatsApp link matters more than
 * the easing — and `scroll-margin-top` on the target is what stops the sticky header covering the
 * heading it lands on.
 *
 * Renders nothing when there is nothing to show: only 5% of the catalogue has ever been delivered,
 * so an "0 отзывов" line under the other 95% would be a permanent reminder of an empty feature.
 */
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
      <StarRating average={average} />
      <span className="text-sm font-medium">{average.toFixed(1).replace(".", ",")}</span>
      <span className="text-sm text-gray-500 group-hover:text-green-700 group-hover:underline">
        {ratingCount} {reviewPlural(ratingCount)}
      </span>
    </a>
  );
}
