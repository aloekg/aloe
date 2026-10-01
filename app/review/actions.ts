"use server";

import { rateLimit } from "@/lib/rate-limit";
import { displayAuthorName, normalizeReviewBody, orderCanBeReviewed, validateReview } from "@/lib/reviews";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import {
  claimOrderForUser,
  getOrderByReviewToken,
  getProfileName,
  getReviewedProductIds,
  insertReview,
} from "@/services/review.service";
import type { OrderItem } from "@/types";

type Result = { ok: true } | { ok: false; error: string };

function fail(error: string): Result {
  return { ok: false, error };
}

export async function submitReview({
  token,
  productId,
  rating,
  body,
}: {
  token: string;
  productId: number;
  rating: number;
  body: string;
}): Promise<Result> {
  const { allowed } = await rateLimit("submit-review", { limit: 20, windowSeconds: 60 });
  if (!allowed) return fail("Слишком много отзывов подряд. Попробуйте через минуту.");

  const invalid = validateReview(rating, body);
  if (invalid) return fail(invalid);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Войдите в аккаунт, чтобы опубликовать отзыв.");

  const admin = createAdminClient();

  let order;
  try {
    order = await getOrderByReviewToken(admin, token);
  } catch (err) {
    console.error("[reviews] token lookup failed", err);
    return fail("Не удалось проверить ссылку. Попробуйте ещё раз.");
  }
  // Same message for unknown and undelivered tokens on purpose: do not confirm a token exists.
  if (!order || !orderCanBeReviewed(order.status)) return fail("Ссылка недействительна.");

  const items = (order.items ?? []) as OrderItem[];
  if (!items.some((i) => i.id === productId)) return fail("Этого товара не было в заказе.");

  const alreadyReviewed = await getReviewedProductIds(admin, user.id, [productId]);
  if (alreadyReviewed.includes(productId)) {
    return fail("Вы уже оценили этот товар. Изменить отзыв можно в профиле, во вкладке «Отзывы».");
  }

  // Shortened before storing: anon can read approved review rows, so the surname must never reach them.
  const profileName =
    (await getProfileName(admin, user.id)) ??
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;

  const { error } = await insertReview(admin, {
    productId,
    orderId: order.id,
    userId: user.id,
    rating,
    body: normalizeReviewBody(body),
    authorName: displayAuthorName(profileName),
  });
  if (error) {
    if (error.code === "23505") {
      return fail("Вы уже оценили этот товар. Изменить отзыв можно в профиле, во вкладке «Отзывы».");
    }
    console.error("[reviews] insert failed:", error.message);
    return fail("Не удалось сохранить отзыв. Попробуйте ещё раз.");
  }

  if (!order.user_id) {
    const { error: claimError } = await claimOrderForUser(admin, order.id, user.id);
    if (claimError) console.error("[reviews] order claim failed:", claimError.message);
  }

  // No cache tag expired on purpose: nothing is public until a moderator approves it.
  return { ok: true };
}
