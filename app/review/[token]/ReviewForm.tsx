"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import Image from "next/image";
import { Button, RatingInput } from "@/components";
import { MAX_REVIEW_BODY, validateReview } from "@/lib/reviews";
import { useToast } from "@/store/toast";
import type { OrderItem } from "@/types";
import { submitReview } from "../actions";

/**
 * One card per product still awaiting a review. Each submits on its own — an order of five lines
 * should not be all-or-nothing, and someone who only wants to rate one thing should be able to.
 */
function ProductReview({ token, item, onDone }: { token: string; item: OrderItem; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const show = useToast((s) => s.show);

  const problem = validateReview(rating, body);

  async function send() {
    setPending(true);
    setError(null);
    const result = await submitReview({ token, productId: item.id, rating, body });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    show("Спасибо! Отзыв отправлен на модерацию", "success");
    onDone();
  }

  return (
    <li className="border border-gray-300 rounded-xl p-4">
      <div className="flex gap-3 mb-4">
        {item.image_url && (
          <Image
            src={item.image_url}
            alt=""
            width={56}
            height={56}
            unoptimized
            className="size-14 object-contain shrink-0"
          />
        )}
        <p className="text-sm font-medium">{item.name}</p>
      </div>

      <RatingInput value={rating} onChange={setRating} name={`rating-${item.id}`} disabled={pending} />

      <label htmlFor={`body-${item.id}`} className="sr-only">
        Текст отзыва
      </label>
      <textarea
        id={`body-${item.id}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={pending}
        rows={3}
        maxLength={MAX_REVIEW_BODY}
        placeholder="Что понравилось, что нет? Необязательно."
        className="mt-3 w-full text-base md:text-sm border border-gray-500 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-700 focus:border-green-700"
      />

      {error && (
        <p role="alert" className="text-sm text-red-600 mt-2">
          {error}
        </p>
      )}

      <Button variant="primary" size="lg" className="mt-3 w-full" onClick={send} disabled={pending || !!problem}>
        {pending ? "Отправляем…" : "Отправить отзыв"}
      </Button>
      {problem && rating > 0 && <p className="text-xs text-gray-500 mt-2">{problem}</p>}
    </li>
  );
}

export default function ReviewForm({ token, items }: { token: string; items: OrderItem[] }) {
  const [done, setDone] = useState<number[]>([]);
  const left = items.filter((i) => !done.includes(i.id));

  if (left.length === 0) {
    return (
      <div className="text-center py-12">
        <Check className="size-12 text-green-700 mx-auto mb-3" aria-hidden />
        <p className="text-lg font-medium">Спасибо за отзывы!</p>
        <p className="text-sm text-gray-500 mt-1">Мы опубликуем их после проверки — обычно в течение дня.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {left.map((item) => (
        <ProductReview key={item.id} token={token} item={item} onDone={() => setDone((prev) => [...prev, item.id])} />
      ))}
    </ul>
  );
}
