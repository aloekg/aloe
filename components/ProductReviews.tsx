import { StarRating } from "@/components";
import { averageRating } from "@/lib/reviews";

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
    <section aria-labelledby="reviews-heading" className="mt-10">
      <h2 id="reviews-heading" className="text-lg font-semibold mb-3">
        Отзывы
      </h2>

      <div className="flex items-center gap-3 mb-5">
        <span className="text-3xl font-bold leading-none">{average.toFixed(1).replace(".", ",")}</span>
        <span className="flex flex-col gap-0.5">
          <StarRating average={average} size="md" />
          <span className="text-xs text-gray-500">
            {ratingCount} {plural(ratingCount, "отзыв", "отзыва", "отзывов")}
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

/** ru-RU plurals: 1 отзыв, 2 отзыва, 5 отзывов — and 11..14 take the last form. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
