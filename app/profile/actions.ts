"use server";

import { revalidatePath } from "next/cache";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase-server";
import { CONTACT_LIMITS, normalizeText } from "@/lib/text";
import { saveProfile as saveProfileService } from "@/services/profile.service";

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
