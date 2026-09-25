import { StarRating } from "@/components";
import { authorInitial, avatarTone, averageRating, reviewPlural } from "@/lib/reviews";

type Review = {
  id: number;
  rating: number;
  body: string | null;
  author_name: string | null;
  created_at: string;
};

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

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
    // scroll-mt mirrors the sticky header height (`top-15 md:top-41.5`).
    <section id="reviews" aria-labelledby="reviews-heading" className="mb-12 scroll-mt-16 md:scroll-mt-44">
      <h2 id="reviews-heading" className="text-lg font-semibold mb-3">
        Отзывы
      </h2>

      <div className="flex items-center gap-3 mb-5">
        <span className="text-3xl font-bold leading-none" aria-hidden>
          {average.toFixed(1).replace(".", ",")}
        </span>
        <span className="flex flex-col gap-0.5">
          <StarRating average={average} size="md" />
          <span className="text-xs text-gray-500">
            {ratingCount} {reviewPlural(ratingCount)}
          </span>
        </span>
      </div>

      <ul className="flex flex-col gap-4">
        {reviews.map((review) => (
          <li key={review.id} className="flex gap-3 border-b border-gray-200 pb-4 last:border-0">
            <span
              aria-hidden
              className={`flex items-center justify-center size-9 shrink-0 rounded-full text-white text-sm font-semibold ${avatarTone(review.author_name)}`}
            >
              {authorInitial(review.author_name)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium">{review.author_name ?? "Покупатель"}</span>
                <time dateTime={review.created_at} className="text-xs text-gray-500">
                  {dateFmt.format(new Date(review.created_at))}
                </time>
              </div>
              <StarRating average={review.rating} className="mt-0.5" />
              {review.body && <p className="text-sm text-gray-700 whitespace-pre-line mt-1.5">{review.body}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
