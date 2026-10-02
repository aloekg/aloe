import Link from "next/link";
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
  id = "reviews",
  // scroll-mt mirrors the sticky header height (`top-15 md:top-41.5`).
  className = "mb-12 scroll-mt-16 md:scroll-mt-44",
  limit,
  allHref,
  hardNavigation = false,
  hideHeading = false,
}: {
  reviews: Review[];
  ratingSum: number;
  ratingCount: number;
  id?: string;
  className?: string;
  // Show the first `limit` and link the rest to `allHref`.
  limit?: number;
  allHref?: string;
  // The quick view: a soft navigation would leave the @modal slot open over the next page.
  hardNavigation?: boolean;
  // The reviews page, whose own title already says "Отзывы".
  hideHeading?: boolean;
}) {
  const average = averageRating(ratingSum, ratingCount);
  if (!average || reviews.length === 0) return null;

  const shown = limit == null ? reviews : reviews.slice(0, limit);
  const more = allHref && shown.length < reviews.length;
  const moreLabel = `Показать все ${ratingCount} ${reviewPlural(ratingCount)}`;
  const moreCls =
    "mt-4 block w-full md:w-fit text-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium " +
    "text-green-700 hover:bg-gray-50 transition-colors";

  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={className}>
      <h2 id={`${id}-heading`} className={hideHeading ? "sr-only" : "text-lg font-semibold mb-3"}>
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
        {shown.map((review) => (
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

      {more &&
        (hardNavigation ? (
          <a href={allHref} className={moreCls}>
            {moreLabel}
          </a>
        ) : (
          <Link href={allHref} className={moreCls}>
            {moreLabel}
          </Link>
        ))}
    </section>
  );
}
