import type { SupabaseClient } from "@supabase/supabase-js";
import { soft } from "@/lib/db";
import { isReviewToken } from "@/lib/reviews";
import type { ReviewWithProduct } from "@/types";
import type { Database } from "@/types/database";

const PUBLIC_COLUMNS = "id, product_id, rating, body, author_name, created_at";

export async function getProductReviews(supabase: SupabaseClient<Database>, productId: number, limit = 20) {
  const res = await supabase
    .from("reviews")
    .select(PUBLIC_COLUMNS)
    .eq("product_id", productId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);
  return soft("product-reviews", res, []);
}

export async function getOrderByReviewToken(admin: SupabaseClient<Database>, token: string) {
  // Guard before the query: Postgres errors on a malformed uuid, which must read as "no such order".
  if (!isReviewToken(token)) return null;

  const { data, error } = await admin
    .from("orders")
    .select("id, status, items, user_id, created_at")
    .eq("review_token", token)
    .maybeSingle();
  if (error) throw new Error(`[reviews] token lookup failed: ${error.message}`);
  return data;
}

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

export async function getProfileName(admin: SupabaseClient<Database>, userId: string): Promise<string | null> {
  const { data, error } = await admin.from("profiles").select("name").eq("id", userId).maybeSingle();
  if (error) {
    console.error(`[reviews] profile lookup failed: ${error.message}`);
    return null;
  }
  return data?.name ?? null;
}

// The `user_id is null` filter is the guard: an order that already has an owner must never change hands.
export async function claimOrderForUser(admin: SupabaseClient<Database>, orderId: number, userId: string) {
  return admin.from("orders").update({ user_id: userId }).eq("id", orderId).is("user_id", null);
}

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

export async function getReviewStatusCounts(admin: SupabaseClient<Database>): Promise<Record<string, number>> {
  const { data, error } = await admin.from("reviews").select("status");
  if (error) throw new Error(`[reviews] status counts failed: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}

// Returns product_id so the caller expires that product's cache tag only.
export async function setReviewStatus(admin: SupabaseClient<Database>, id: number, status: string) {
  return admin.from("reviews").update({ status }).eq("id", id).select("product_id").maybeSingle();
}

export async function deleteReview(admin: SupabaseClient<Database>, id: number) {
  return admin.from("reviews").delete().eq("id", id).select("product_id").maybeSingle();
}

// Service role on purpose: user_id is not readable by anon/authenticated. userId must come from the session.
export async function getUserReviews(admin: SupabaseClient<Database>, userId: string): Promise<ReviewWithProduct[]> {
  const res = await admin
    .from("reviews")
    .select("*, products(id, name, thumbnail_url)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return soft("user-reviews", res, []) as ReviewWithProduct[];
}

// Must match canEditReview.
const EDITABLE_STATUSES = ["pending", "rejected"];

// The user_id filter is required: without it the id alone would rewrite anyone's review.
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
      // Status checked in the statement too, so a concurrent approval cannot be overwritten.
      .in("status", EDITABLE_STATUSES)
      .select("id, status")
      .maybeSingle()
  );
}
