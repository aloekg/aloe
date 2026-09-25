"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import Image from "next/image";
import { Button, RatingInput } from "@/components";
import { MAX_REVIEW_BODY, validateReview } from "@/lib/reviews";
import { useToast } from "@/store/toast";
import type { OrderItem } from "@/types";
import { submitReview } from "../actions";

function ProductReview({ token, item, onDone }: { token: string; item: OrderItem; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const show = useToast((s) => s.show);

  async function send() {
    // Validated on press rather than by disabling the button: a disabled button is skipped by Tab.
    const problem = validateReview(rating, body);
    if (problem) {
      setError(problem);
      return;
    }
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
    // tabIndex -1: receives focus after the previous card submits and unmounts.
    <li className="border border-gray-300 rounded-xl p-4 outline-none" tabIndex={-1}>
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

      <RatingInput value={rating} onChange={setRating} name={`rating-${item.id}`} disabled={pending} required />

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

      <Button variant="primary" size="lg" className="mt-3 w-full" onClick={send} disabled={pending}>
        {pending ? "Отправляем…" : "Отправить отзыв"}
      </Button>
    </li>
  );
}

export default function ReviewForm({ token, items }: { token: string; items: OrderItem[] }) {
  const [done, setDone] = useState<number[]>([]);
  const left = items.filter((i) => !done.includes(i.id));
  const listRef = useRef<HTMLUListElement>(null);
  const thanksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (done.length === 0) return;
    const next = thanksRef.current ?? listRef.current?.querySelector<HTMLElement>("li");
    next?.focus();
  }, [done]);

  if (left.length === 0) {
    return (
      <div ref={thanksRef} tabIndex={-1} className="text-center py-12 outline-none">
        <Check className="size-12 text-green-700 mx-auto mb-3" aria-hidden />
        <p className="text-lg font-medium">Спасибо за отзывы!</p>
        <p className="text-sm text-gray-500 mt-1">Мы опубликуем их после проверки — обычно в течение дня.</p>
      </div>
    );
  }

  return (
    <ul ref={listRef} className="flex flex-col gap-4">
      {left.map((item) => (
        <ProductReview key={item.id} token={token} item={item} onDone={() => setDone((prev) => [...prev, item.id])} />
      ))}
    </ul>
  );
}
