"use server";

import { revalidatePath, updateTag } from "next/cache";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeReviewBody, validateReview } from "@/lib/reviews";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { CONTACT_LIMITS, normalizeText } from "@/lib/text";
import { saveProfile as saveProfileService } from "@/services/profile.service";
import { updateOwnReview } from "@/services/review.service";

/**
 * Saves the customer's own contact details.
 *
 * Authorization is settled twice over — `userId` comes from the session rather than the argument,
 * and the anon client writes under the `profiles` RLS policies, which key on `auth.uid() = id`.
 * What was missing was any bound on *what* gets written: `profiles.name/phone/address` are plain
 * `text` with no length constraint, so an account could store megabytes per field, as often as it
 * liked, and every one of those rows is rendered back in the superadmin's user list. React escapes
 * them, so this was never injection — it was unbounded storage behind a single free registration.
 *
 * Bounded the same way checkout bounds the same three fields (lib/text.ts), and rate limited like
 * the other public actions. 20/minute is far above a human editing a form and far below a loop.
 */
export async function saveProfile({ name, phone, address }: { name: string; phone: string; address: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Не авторизован");

  const { allowed } = await rateLimit("save-profile", { limit: 20, windowSeconds: 60 });
  if (!allowed) throw new Error("Слишком много запросов. Попробуйте через минуту.");

  const error = await saveProfileService(supabase, user.id, {
    name: normalizeText(name, CONTACT_LIMITS.name),
    phone: normalizeText(phone, CONTACT_LIMITS.phone),
    address: normalizeText(address, CONTACT_LIMITS.address),
  });

  // The raw Postgres message named columns and constraints to anyone who could open the form.
  if (error) {
    console.error(`[profile] save failed for ${user.id}: ${error.message}`);
    throw new Error("Не удалось сохранить профиль. Попробуйте ещё раз.");
  }

  revalidatePath("/profile");
}

/**
 * Rewrites one of the signed-in customer's own reviews.
 *
 * **An edit always returns the review to moderation**, even when it was already published. Without
 * that, anyone could post something bland, wait for approval and then rewrite the live page — which
 * is the standard way a moderated system gets bypassed, and the reason the status reset lives in the
 * same statement as the edit rather than in a branch above it.
 */
export async function editReview({
  reviewId,
  rating,
  body,
}: {
  reviewId: number;
  rating: number;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { allowed } = await rateLimit("edit-review", { limit: 20, windowSeconds: 60 });
  if (!allowed) return { ok: false, error: "Слишком много правок подряд. Попробуйте через минуту." };

  const invalid = validateReview(rating, body);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Войдите в аккаунт." };

  const { data, error } = await updateOwnReview(createAdminClient(), {
    reviewId,
    userId: user.id,
    rating,
    body: normalizeReviewBody(body),
  });
  if (error) {
    console.error("[profile] review update failed:", error.message);
    return { ok: false, error: "Не удалось сохранить отзыв. Попробуйте ещё раз." };
  }
  // No row means the id is not this customer's. Same message either way — whose review it is, is
  // not something a probe should be able to learn.
  if (!data) return { ok: false, error: "Отзыв не найден." };

  // The rating on the product changes whenever an approved review leaves that state, and the rating
  // is on every card. Expiring unconditionally: working out whether it *was* approved would take
  // another read to save an invalidation that costs one cached entry.
  updateTag("products");
  revalidatePath("/profile");

  return { ok: true };
}
