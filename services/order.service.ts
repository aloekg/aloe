import type { SupabaseClient } from "@supabase/supabase-js";
import { ORDER_STATUS } from "@/lib/constants";
import type { Order, OrderItem } from "@/types";
import type { Database } from "@/types/database";

/**
 * `.or()` takes a raw PostgREST filter expression, so anything interpolated into it can
 * rewrite the filter tree. Strip the characters that carry meaning there.
 */
function escapeOrFilterValue(value: string): string {
  return (
    value
      // Characters that carry meaning in a PostgREST filter expression.
      .replace(/[,().:*"\\]/g, " ")
      // ...and the LIKE wildcards, which `escapeLike` handles for products but were left here:
      // a search of "%" matched every order.
      .replace(/[%_]/g, " ")
      .trim()
  );
}

/**
 * Paginated server-side. This used to select every order a customer had ever placed — including
 * the `items` jsonb blob for each — and ProfileTabs then sliced the array in the browser.
 */
export async function getUserOrders(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<{ orders: Order[]; total: number }> {
  const { page = 1, pageSize = 10 } = options;
  const from = (page - 1) * pageSize;

  const { data, count, error } = await supabase
    .from("orders")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    // Tiebreak by id: ordering on created_at alone can duplicate or skip rows across pages when
    // timestamps collide. Every product query gained this in the previous pass; orders missed it.
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) console.error("[orders] user orders load error:", error.message);
  // `items` is jsonb; checkout is the only writer and always stores OrderItem[].
  return { orders: (data ?? []) as Order[], total: count ?? 0 };
}

export async function getAdminOrders(
  supabase: SupabaseClient<Database>,
  options: { q?: string; statuses?: string[]; page?: number; pageSize?: number },
) {
  const { q = "", statuses = [], page = 1, pageSize = 15 } = options;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  const safeQ = escapeOrFilterValue(q);
  if (safeQ) query = query.or(`customer_name.ilike.%${safeQ}%,customer_phone.ilike.%${safeQ}%`);
  if (statuses.length > 0) query = query.in("status", statuses);

  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) console.error(`[admin-orders] ${error.message}`);
  return { orders: (data ?? []) as Order[], total: count ?? 0 };
}

/**
 * One head-count per status instead of reading every row and tallying in JS. The old version was
 * silently truncated by PostgREST's max-rows, so past 1000 orders the admin badges were wrong.
 */
export async function getOrderStatusCounts(supabase: SupabaseClient<Database>) {
  const statuses = Object.keys(ORDER_STATUS);
  const results = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error) console.error(`[orders] count for status ${status} failed:`, error.message);
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(results) as Record<string, number>;
}

export async function insertOrder(
  supabase: SupabaseClient<Database>,
  data: {
    userId?: string;
    name: string;
    phone: string;
    address: string;
    comment: string;
    items: OrderItem[];
    total: number;
    deliveryType: string;
    deliveryCost: number;
  },
) {
  return supabase
    .from("orders")
    .insert({
      user_id: data.userId,
      items: data.items,
      total: data.total,
      customer_name: data.name,
      customer_phone: data.phone,
      customer_address: data.address,
      comment: data.comment || null,
      status: "new",
      delivery_type: data.deliveryType,
      delivery_cost: data.deliveryCost,
    })
    .select("id, created_at")
    .single();
}

/**
 * Records that the admin notification actually went out. NULL means it never did — which is what
 * made the 2026-08-17 SMTP breakage invisible until someone checked their inbox by hand.
 */
export async function markOrderNotified(supabase: SupabaseClient<Database>, orderId: number) {
  const { error } = await supabase.from("orders").update({ notified_at: new Date().toISOString() }).eq("id", orderId);
  if (error) console.error(`[orders] could not mark ${orderId} notified: ${error.message}`);
}

/**
 * Everything needed to re-send a notification for an existing order.
 *
 * `maybeSingle`, not `single`: a missing order is an ordinary outcome here, and `single` reports it
 * with the same PGRST116 code it uses for "more than one row" (see lib/db.ts) — so a duplicated id
 * showed up in the admin as "Заказ не найден" rather than as the integrity problem it is. Zero rows
 * now arrive as `{ data: null, error: null }`, which lets the caller tell the two apart.
 */
export async function getOrderForNotification(supabase: SupabaseClient<Database>, orderId: number) {
  return supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
}
