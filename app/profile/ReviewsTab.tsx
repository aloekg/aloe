"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import Button from "@/components/Button";
import RatingInput from "@/components/RatingInput";
import StarRating from "@/components/StarRating";
import { canEditReview, MAX_REVIEW_BODY, REVIEW_STATUS, validateReview, type ReviewStatus } from "@/lib/reviews";
import { useToast } from "@/store/toast";
import type { ReviewWithProduct } from "@/types";
import { editReview } from "./actions";

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

/** What each status means for the person who wrote it — the storefront's labels say too little here. */
const STATUS_NOTE: Record<ReviewStatus, string> = {
  pending: "Мы проверим его и опубликуем — обычно в течение дня. Пока он на модерации, его можно изменить.",
  approved: "Опубликован на странице товара. Опубликованный отзыв изменить уже нельзя.",
  rejected: "Не прошёл проверку. Отредактируйте его, и мы посмотрим ещё раз.",
};

function ReviewRow({ review }: { review: ReviewWithProduct }) {
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(review.rating);
  const [body, setBody] = useState(review.body ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const show = useToast((s) => s.show);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);

  // "Редактировать" is replaced by the form, and "Сохранить"/"Отмена" by the button again — each
  // taking the focused element with it. Move focus to what replaced it; never on first render.
  useEffect(() => {
    if (editing) formRef.current?.focus();
    else if (touched.current) editButtonRef.current?.focus();
  }, [editing]);

  const badge = REVIEW_STATUS[review.status as ReviewStatus];
  const problem = validateReview(rating, body);
  const unchanged = rating === review.rating && body === (review.body ?? "");

  async function save() {
    setPending(true);
    setError(null);
    const result = await editReview({ reviewId: review.id, rating, body });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    show("Отзыв отправлен на проверку", "success");
    setEditing(false);
  }

  function cancel() {
    setRating(review.rating);
    setBody(review.body ?? "");
    setError(null);
    setEditing(false);
  }

  return (
    <li className="border border-gray-300 rounded-xl p-4">
      <div className="flex gap-3">
        {review.products?.thumbnail_url && (
          <Image
            src={review.products.thumbnail_url}
            alt=""
            width={56}
            height={56}
            unoptimized
            className="size-14 object-contain shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          {review.products ? (
            <Link href={`/product/${review.products.id}`} className="text-sm font-medium hover:underline">
              {review.products.name}
            </Link>
          ) : (
            <span className="text-sm font-medium text-gray-500">Товар больше не продаётся</span>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${badge?.cls ?? ""}`}>{badge?.label}</span>
            <time dateTime={review.created_at} className="text-xs text-gray-500">
              {dateFmt.format(new Date(review.created_at))}
            </time>
          </div>
        </div>
      </div>

      {editing ? (
        <div ref={formRef} tabIndex={-1} className="mt-4 outline-none">
          <RatingInput value={rating} onChange={setRating} name={`rating-${review.id}`} disabled={pending} />
          <label htmlFor={`body-${review.id}`} className="sr-only">
            Текст отзыва
          </label>
          <textarea
            id={`body-${review.id}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={pending}
            rows={3}
            maxLength={MAX_REVIEW_BODY}
            className="mt-3 w-full text-base md:text-sm border border-gray-500 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-700 focus:border-green-700"
          />
          {/* Said before they press save, not after: a rejected review goes back into the queue
              rather than straight onto the page. */}
          {review.status === "rejected" && (
            <p className="text-xs text-gray-500 mt-2">После изменения отзыв снова уйдёт на проверку.</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600 mt-2">
              {error}
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <Button variant="primary" onClick={save} disabled={pending || !!problem || unchanged}>
              {pending ? "Сохраняем…" : "Сохранить"}
            </Button>
            <Button variant="secondary" onClick={cancel} disabled={pending}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <StarRating average={review.rating} />
          {review.body && <p className="text-sm text-gray-700 whitespace-pre-line mt-1.5">{review.body}</p>}
          <p className="text-xs text-gray-500 mt-2">{STATUS_NOTE[review.status as ReviewStatus]}</p>
          {canEditReview(review.status) && (
            <Button
              ref={editButtonRef}
              variant="secondary"
              onClick={() => {
                touched.current = true;
                setEditing(true);
              }}
              className="mt-3 flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              <Pencil className="size-3.5" aria-hidden /> Редактировать
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export default function ReviewsTab({ reviews }: { reviews: ReviewWithProduct[] }) {
  if (reviews.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">Отзывов пока нет</p>
        <p className="text-sm mt-1">Оставить отзыв можно на доставленный заказ — кнопка появится в истории заказов.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {reviews.map((review) => (
        <ReviewRow key={review.id} review={review} />
      ))}
    </ul>
  );
}
