"use server";

import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { claimOrderForUser, getOrderByReviewToken } from "@/services/review.service";

/**
 * Attaches the order behind `token` to the signed-in account, then lands on the profile.
 *
 * A POST, deliberately. The page used to do this on GET — open the link while signed in and the
 * order was yours — which made the link itself the action: anyone could place a guest order and
 * send its `/order/<token>` to a signed-in stranger, and a customer who forwarded their own link to
 * a family member gave the order away with it. Now the page shows the order and asks; the claim
 * happens on the button, from this action, and only while the order still belongs to nobody
 * (`is("user_id", null)` inside the update, so two tabs cannot both win).
 */
export async function claimOrder(token: string): Promise<{ ok: false; error: string } | never> {
  const { allowed } = await rateLimit("claim-order", { limit: 10, windowSeconds: 60 });
  if (!allowed) return { ok: false, error: "Слишком много попыток. Попробуйте через минуту." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth?next=${encodeURIComponent(`/order/${token}`)}`);

  const admin = createAdminClient();
  const order = await getOrderByReviewToken(admin, token);
  if (!order) return { ok: false, error: "Ссылка недействительна." };

  if (!order.user_id) {
    const { error } = await claimOrderForUser(admin, order.id, user.id);
    if (error) {
      console.error("[order] claim failed:", error.message);
      return { ok: false, error: "Не удалось привязать заказ. Попробуйте ещё раз." };
    }
  }

  redirect("/profile");
}
