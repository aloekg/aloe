"use client";

import { useState, useTransition } from "react";
import { Check, Trash2, Undo2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button, Pagination, StarRating } from "@/components";
import { REVIEW_STATUS, type ReviewStatus } from "@/lib/reviews";
import type { ReviewWithProduct } from "@/types";
import { removeReview, setReviewModeration } from "./actions";
import { useAdminListNav } from "./useAdminListNav";

const PAGE_SIZE = 20;

const TABS: { value: string; label: string }[] = [
  { value: "pending", label: "На модерации" },
  { value: "approved", label: "Опубликованные" },
  { value: "rejected", label: "Отклонённые" },
  { value: "all", label: "Все" },
];

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });

/**
 * The moderation queue. Defaults to `pending`, because that is the only tab with work in it — the
 * others exist to undo a decision.
 */
export default function AdminReviews({
  reviews,
  total,
  page,
  status,
  counts,
}: {
  reviews: ReviewWithProduct[];
  total: number;
  page: number;
  status: string;
  counts: Record<string, number>;
}) {
  const navigate = useAdminListNav({ status: "pending" });
  const [pending, startTransition] = useTransition();
  // Which row is mid-action, so only its buttons go quiet rather than the whole list.
  const [busy, setBusy] = useState<number | null>(null);

  const act = (id: number, run: () => Promise<void>) => {
    setBusy(id);
    startTransition(async () => {
      await run();
      setBusy(null);
    });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((tab) => {
          const count = tab.value === "all" ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[tab.value];
          const active = status === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => navigate({ status: tab.value })}
              aria-pressed={active}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer ${
                active ? "bg-green-700 border-green-600 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {tab.label}
              {count ? <span className={active ? "ml-1.5" : "ml-1.5 text-gray-500"}>{count}</span> : null}
            </button>
          );
        })}
      </div>

      {reviews.length === 0 ? (
        <p className="text-gray-500 py-12 text-center">Отзывов здесь нет</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reviews.map((review) => {
            const badge = REVIEW_STATUS[review.status as ReviewStatus];
            const disabled = pending && busy === review.id;
            return (
              <li key={review.id} className="border border-gray-300 rounded-xl p-4">
                <div className="flex flex-wrap items-start gap-3">
                  {review.products?.thumbnail_url && (
                    <Image
                      src={review.products.thumbnail_url}
                      alt=""
                      width={48}
                      height={48}
                      unoptimized
                      className="size-12 object-contain shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-48">
                    {review.products ? (
                      <Link
                        href={`/product/${review.products.id}`}
                        target="_blank"
                        className="text-sm font-medium hover:underline"
                      >
                        {review.products.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-gray-500">Товар удалён</span>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <StarRating average={review.rating} />
                      <span className="text-xs text-gray-500">
                        {review.author_name ?? "Покупатель"} · заказ #{review.order_id} ·{" "}
                        {dateFmt.format(new Date(review.created_at))}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge?.cls ?? ""}`}>{badge?.label}</span>
                    </div>
                  </div>
                </div>

                {review.body && <p className="text-sm text-gray-700 whitespace-pre-line mt-3">{review.body}</p>}

                <div className="flex flex-wrap gap-2 mt-3">
                  {review.status !== "approved" && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={disabled}
                      onClick={() => act(review.id, () => setReviewModeration(review.id, "approved"))}
                      className="flex items-center gap-1.5"
                    >
                      <Check className="size-4" aria-hidden /> Опубликовать
                    </Button>
                  )}
                  {review.status !== "rejected" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={disabled}
                      onClick={() => act(review.id, () => setReviewModeration(review.id, "rejected"))}
                      className="flex items-center gap-1.5"
                    >
                      <X className="size-4" aria-hidden /> Отклонить
                    </Button>
                  )}
                  {review.status !== "pending" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={disabled}
                      onClick={() => act(review.id, () => setReviewModeration(review.id, "pending"))}
                      className="flex items-center gap-1.5"
                    >
                      <Undo2 className="size-4" aria-hidden /> Вернуть на модерацию
                    </Button>
                  )}
                  {/* Rejecting keeps the row, and the unique constraint on (order_id, product_id)
                      then stops the same person reposting. Deleting gives that back, so it is for
                      content that must not remain stored at all. */}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => {
                      if (confirm("Удалить отзыв навсегда? Покупатель сможет оставить новый.")) {
                        act(review.id, () => removeReview(review.id));
                      }
                    }}
                    className="flex items-center gap-1.5 ml-auto text-red-600"
                  >
                    <Trash2 className="size-4" aria-hidden /> Удалить
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        page={page}
        totalPages={Math.ceil(total / PAGE_SIZE)}
        onPageChange={(next) => navigate({ status, page: next })}
      />
    </div>
  );
}
