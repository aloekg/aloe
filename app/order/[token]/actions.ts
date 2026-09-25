"use server";

import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { claimOrderForUser, getOrderByReviewToken } from "@/services/review.service";

// Must stay a POST, never the page's GET: a link must not claim an order by itself.
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
