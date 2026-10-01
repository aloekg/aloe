"use server";

import { revalidatePath } from "next/cache";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeReviewBody, validateReview } from "@/lib/reviews";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { CONTACT_LIMITS, normalizeText } from "@/lib/text";
import { saveProfile as saveProfileService } from "@/services/profile.service";
import { updateOwnReview } from "@/services/review.service";

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

  // Never return error.message: it names columns and constraints.
  if (error) {
    console.error(`[profile] save failed for ${user.id}: ${error.message}`);
    throw new Error("Не удалось сохранить профиль. Попробуйте ещё раз.");
  }

  revalidatePath("/profile");
}

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
  if (!data) return { ok: false, error: "Опубликованный отзыв изменить нельзя." };

  revalidatePath("/profile");

  return { ok: true };
}
