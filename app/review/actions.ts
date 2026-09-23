"use server";

import { rateLimit } from "@/lib/rate-limit";
import { normalizeReviewBody, orderCanBeReviewed, validateReview } from "@/lib/reviews";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import {
  claimOrderForUser,
  getOrderByReviewToken,
  getReviewedProductIds,
  insertReview,
} from "@/services/review.service";
import type { OrderItem } from "@/types";

type Result = { ok: true } | { ok: false; error: string };

function fail(error: string): Result {
  return { ok: false, error };
}

/**
 * Publishes a review, and is the only place the right to write one is decided.
 *
 * Three things have to hold, and none of them can be expressed as an RLS policy — the last because
 * `orders.items` is a jsonb document, not a joinable table:
 *
 *   1. the token names a real order, and that order has been delivered;
 *   2. the visitor is signed in (the sign-in is the point — see the 20260923140000 migration);
 *   3. the product was actually in that order.
 *
 * It runs on the service-role client for the same reason `createOrder` does: the checks live here,
 * in code, rather than in a policy that could only see part of them.
 */
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
  // Public and unauthenticated until the session check below, and it writes. Generous enough for
  // someone rating every line of a large order, tight enough to bound a script.
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
  // Deliberately the same message for "no such token" and "not delivered yet": a token is a secret,
  // and confirming that one exists is more than a stranger holding a guessed link should learn.
  if (!order || !orderCanBeReviewed(order.status)) return fail("Ссылка недействительна.");

  const items = (order.items ?? []) as OrderItem[];
  if (!items.some((i) => i.id === productId)) return fail("Этого товара не было в заказе.");

  const alreadyReviewed = await getReviewedProductIds(admin, order.id);
  if (alreadyReviewed.includes(productId)) return fail("Вы уже оставили отзыв на этот товар.");

  const { error } = await insertReview(admin, {
    productId,
    orderId: order.id,
    userId: user.id,
    rating,
    body: normalizeReviewBody(body),
  });
  if (error) {
    // The unique constraint is the race the check above cannot close — two tabs, one order.
    if (error.code === "23505") return fail("Вы уже оставили отзыв на этот товар.");
    console.error("[reviews] insert failed:", error.message);
    return fail("Не удалось сохранить отзыв. Попробуйте ещё раз.");
  }

  // The order was placed as a guest and the token proves this account holds it, so hand it over:
  // the customer gets their order history, which is the real reason to have registered. Never
  // reassigns an order that already belongs to someone.
  if (!order.user_id) {
    const { error: claimError } = await claimOrderForUser(admin, order.id, user.id);
    // Logged, not failed: the review is in, and the order history is a bonus rather than the point.
    if (claimError) console.error("[reviews] order claim failed:", claimError.message);
  }

  // No cache tag is expired here on purpose: nothing a customer writes is visible until a moderator
  // approves it, and that is where `updateTag("products")` belongs. Said out loud so the omission
  // does not read as an oversight.
  return { ok: true };
}
