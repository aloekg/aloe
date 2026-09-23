import type { SupabaseClient } from "@supabase/supabase-js";
import { soft } from "@/lib/db";
import { isReviewToken } from "@/lib/reviews";
import type { ReviewWithProduct } from "@/types";
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

/**
 * Product ids this **customer** has already reviewed, so the form offers only what is left.
 *
 * By customer, not by order: a repeat purchase of the same product does not earn a second review —
 * it earns an edit of the first (see the 20260923200000 migration). Scoped to the ids in the order
 * being reviewed, so it stays a small lookup however much the customer has written.
 */
export async function getReviewedProductIds(
  admin: SupabaseClient<Database>,
  userId: string,
  productIds: number[],
): Promise<number[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await admin
    .from("reviews")
    .select("product_id")
    .eq("user_id", userId)
    .in("product_id", productIds);
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

/**
 * A customer's own reviews, pending and rejected included — the 20260923180000 policy is what lets
 * them through, and only to their author.
 *
 * Read with the *user's* client, not the service role: the policy is the check, so a mistake in the
 * caller cannot hand someone another person's drafts.
 */
export async function getUserReviews(supabase: SupabaseClient<Database>, userId: string): Promise<ReviewWithProduct[]> {
  const res = await supabase
    .from("reviews")
    .select("*, products(id, name, thumbnail_url)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  // soft: the profile page has orders and personal details to show regardless, and a failed review
  // query must not take the whole page down.
  return soft("user-reviews", res, []) as ReviewWithProduct[];
}

/** The statuses `updateOwnReview` will touch — see `canEditReview`. */
const EDITABLE_STATUSES = ["pending", "rejected"];

/**
 * Rewrites a review the customer owns, and only while it is still unpublished.
 *
 * `eq("user_id", userId)` is not decoration: without it the id alone would be enough to rewrite
 * anyone's review. The status filter is the other half — a published review is final, so there is
 * no longer any way to have something approved and then change what it says.
 */
export async function updateOwnReview(
  admin: SupabaseClient<Database>,
  { reviewId, userId, rating, body }: { reviewId: number; userId: string; rating: number; body: string | null },
) {
  return (
    admin
      .from("reviews")
      .update({ rating, body, status: "pending" })
      .eq("id", reviewId)
      .eq("user_id", userId)
      // In the statement, not only in the action above it: a published review is final, and the
      // window between reading a status and writing over it is exactly where a second tab lives.
      .in("status", EDITABLE_STATUSES)
      .select("id, status")
      .maybeSingle()
  );
}
