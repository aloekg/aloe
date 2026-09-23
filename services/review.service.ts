import type { SupabaseClient } from "@supabase/supabase-js";
import { soft, strict } from "@/lib/db";
import { isReviewToken } from "@/lib/reviews";
import type { Review, ReviewWithProduct } from "@/types";
import type { Database } from "@/types/database";

const PUBLIC_COLUMNS = "id, product_id, rating, body, author_name, created_at";

/** Approved reviews of one product, newest first — what the product page renders. */
export async function getProductReviews(supabase: SupabaseClient<Database>, productId: number, limit = 20) {
  const res = await supabase
    .from("reviews")
    .select(PUBLIC_COLUMNS)
    .eq("product_id", productId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);
  // soft, not strict: a failed review query must not take the product page down with it. The page
  // then renders without the section, which is what a product with no reviews looks like anyway.
  return soft("product-reviews", res, []);
}

/** The order a review token names, or null. `maybeSingle` — an unknown token is ordinary. */
export async function getOrderByReviewToken(admin: SupabaseClient<Database>, token: string) {
  // Guarded before the query, not after: Postgres answers a malformed uuid with an error, and an
  // unparseable URL segment must read as "no such order", not as an outage.
  if (!isReviewToken(token)) return null;

  const { data, error } = await admin
    .from("orders")
    .select("id, status, items, user_id, created_at")
    .eq("review_token", token)
    .maybeSingle();
  if (error) throw new Error(`[reviews] token lookup failed: ${error.message}`);
  return data;
}

/** Product ids this order has already been reviewed for, so the form offers only what is left. */
export async function getReviewedProductIds(admin: SupabaseClient<Database>, orderId: number): Promise<number[]> {
  const { data, error } = await admin.from("reviews").select("product_id").eq("order_id", orderId);
  if (error) throw new Error(`[reviews] existing lookup failed: ${error.message}`);
  return (data ?? []).map((r) => r.product_id);
}

export async function insertReview(
  admin: SupabaseClient<Database>,
  review: {
    productId: number;
    orderId: number;
    userId: string;
    rating: number;
    body: string | null;
    authorName: string | null;
  },
) {
  return admin.from("reviews").insert({
    product_id: review.productId,
    order_id: review.orderId,
    user_id: review.userId,
    rating: review.rating,
    body: review.body,
    author_name: review.authorName,
  });
}

/** The name on a customer's profile, for the review they are about to write. Absent is ordinary. */
export async function getProfileName(admin: SupabaseClient<Database>, userId: string): Promise<string | null> {
  const { data, error } = await admin.from("profiles").select("name").eq("id", userId).maybeSingle();
  if (error) {
    // Logged, not thrown: a review signed "Покупатель" is worth more than a failed submission.
    console.error(`[reviews] profile lookup failed: ${error.message}`);
    return null;
  }
  return data?.name ?? null;
}

/**
 * Attaches a guest order to the account that just signed in through its review link. The token is
 * the proof of ownership — it reached the customer over WhatsApp, on their own number — which is
 * what makes this safe without verifying a phone.
 *
 * Conditional on `user_id is null`: an order already belonging to someone must never change hands,
 * however the link was shared afterwards.
 */
export async function claimOrderForUser(admin: SupabaseClient<Database>, orderId: number, userId: string) {
  return admin.from("orders").update({ user_id: userId }).eq("id", orderId).is("user_id", null);
}

/** The moderation queue. Newest first, optionally narrowed to one status. */
export async function getAdminReviews(
  admin: SupabaseClient<Database>,
  { status, page, pageSize = 20 }: { status?: string; page: number; pageSize?: number },
) {
  const from = (page - 1) * pageSize;
  let q = admin
    .from("reviews")
    .select("*, products(id, name, thumbnail_url)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (status) q = q.eq("status", status);

  const { data, count, error } = await q;
  if (error) throw new Error(`[reviews] admin list failed: ${error.message}`);
  return { reviews: (data ?? []) as ReviewWithProduct[], total: count ?? 0 };
}

/** How many reviews sit in each status, for the admin's filter counts. */
export async function getReviewStatusCounts(admin: SupabaseClient<Database>): Promise<Record<string, number>> {
  const { data, error } = await admin.from("reviews").select("status");
  if (error) throw new Error(`[reviews] status counts failed: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}

export async function setReviewStatus(admin: SupabaseClient<Database>, id: number, status: string) {
  return admin.from("reviews").update({ status }).eq("id", id);
}

export async function deleteReview(admin: SupabaseClient<Database>, id: number) {
  return admin.from("reviews").delete().eq("id", id);
}

/** A customer's own reviews, including the ones still awaiting moderation — only they see those. */
export async function getUserReviews(supabase: SupabaseClient<Database>, userId: string): Promise<Review[]> {
  return strict(
    "user-reviews",
    await supabase.from("reviews").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
  ) as Review[];
}
