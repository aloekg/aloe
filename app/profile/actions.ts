"use server";

import { revalidatePath } from "next/cache";
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
 * **Only while it is unpublished.** A published review is final: editing one used to send it back
 * to moderation, which worked but meant a live review could vanish from a product page at any
 * moment, and left the bypass open in principle — post something bland, wait for approval, rewrite
 * the page. `updateOwnReview` filters on the status in the same statement as the write, so a second
 * tab cannot slip an edit through between the approval and the save.
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
  // No row means the review is not this customer's, or it has already been published. The second
  // case is the likely one and deserves saying — a stale tab whose "Редактировать" button predates
  // the approval would otherwise report "не найден" about a review sitting right there on screen.
  if (!data) return { ok: false, error: "Опубликованный отзыв изменить нельзя." };

  // Only unpublished reviews reach here, so nothing that is currently on a product page changed and
  // no catalogue tag needs expiring. Said out loud so the omission does not read as an oversight.
  revalidatePath("/profile");

  return { ok: true };
}
