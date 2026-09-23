import { StarRating } from "@/components";
import { averageRating, reviewPlural } from "@/lib/reviews";

type Review = { id: number; rating: number; body: string | null; created_at: string };

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

/**
 * The reviews block on a product page.
 *
 * Renders nothing at all when there are none. With 5% of the catalogue ever delivered, an empty
 * "Отзывов пока нет" on the other 95% would be a worse trust signal than silence — and there is
 * nothing a visitor could do about it, since only someone who received the product may write one.
 *
 * Reviews are anonymous by design: the schema keeps `user_id` but nothing renders it. A name here
 * would be a customer's identity attached to a purchase, published, for a shop that never asked
 * permission to do that.
 */
export default function ProductReviews({
  reviews,
  ratingSum,
  ratingCount,
}: {
  reviews: Review[];
  ratingSum: number;
  ratingCount: number;
}) {
  const average = averageRating(ratingSum, ratingCount);
  if (!average || reviews.length === 0) return null;

  return (
    // scroll-margin-top clears the sticky header the #reviews jump would otherwise land behind:
    // 60px of mobile header, 166px of the desktop one (the same numbers as `top-15 md:top-41.5`).
    <section id="reviews" aria-labelledby="reviews-heading" className="mb-12 scroll-mt-16 md:scroll-mt-44">
      <h2 id="reviews-heading" className="text-lg font-semibold mb-3">
        Отзывы
      </h2>

      <div className="flex items-center gap-3 mb-5">
        <span className="text-3xl font-bold leading-none">{average.toFixed(1).replace(".", ",")}</span>
        <span className="flex flex-col gap-0.5">
          <StarRating average={average} size="md" />
          <span className="text-xs text-gray-500">
            {ratingCount} {reviewPlural(ratingCount)}
          </span>
        </span>
      </div>

      <ul className="flex flex-col gap-4">
        {reviews.map((review) => (
          <li key={review.id} className="border-b border-gray-200 pb-4 last:border-0">
            <div className="flex items-center gap-2 mb-1">
              <StarRating average={review.rating} />
              <time dateTime={review.created_at} className="text-xs text-gray-500">
                {dateFmt.format(new Date(review.created_at))}
              </time>
            </div>
            {review.body && <p className="text-sm text-gray-700 whitespace-pre-line">{review.body}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
