import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsOrderRow, CustomerSeenRow } from "@/lib/analytics";
import { addDays, shopDayStart } from "@/lib/analytics";
import { strict } from "@/lib/db";
import type { OrderItem } from "@/types";
import type { Database } from "@/types/database";

/**
 * Reads for the admin dashboard. The aggregation itself is in `lib/analytics.ts`; this file only
 * gets the rows out of Postgres, which PostgREST hands over 1000 at a time whatever `.range()` asks
 * for — hence the paging loops. Every caller is already behind `requireAdmin()`.
 */

/** PostgREST's own ceiling per request; asking for more in one `.range()` silently returns 1000. */
const PAGE = 1000;

/**
 * Enough orders for any period this shop has, and a bound on how much JSON one request can pull
 * into memory — `items` is a jsonb blob per order. Hitting it is reported, not hidden: the page
 * says the numbers cover only the newest orders rather than quietly understating a year.
 */
export const MAX_ANALYTICS_ORDERS = 10_000;

/** Only the identity columns, so the whole order history stays cheap to scan. */
const MAX_CUSTOMER_ROWS = 100_000;

const ORDER_COLUMNS = "id, user_id, customer_phone, total, delivery_cost, delivery_type, status, created_at, items";

/**
 * Orders placed within the shop-local range, newest first. `toDay` is inclusive, so the upper
 * bound is the start of the day after it — comparing against the end of `toDay` would drop
 * everything ordered in its last second.
 */
export async function loadAnalyticsOrders(
  supabase: SupabaseClient<Database>,
  { fromDay, toDay }: { fromDay: string | null; toDay: string },
): Promise<{ rows: AnalyticsOrderRow[]; truncated: boolean }> {
  const rows: AnalyticsOrderRow[] = [];

  for (let offset = 0; offset < MAX_ANALYTICS_ORDERS; offset += PAGE) {
    let query = supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .lt("created_at", shopDayStart(addDays(toDay, 1)).toISOString())
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, Math.min(offset + PAGE, MAX_ANALYTICS_ORDERS) - 1);
    if (fromDay) query = query.gte("created_at", shopDayStart(fromDay).toISOString());

    const batch = strict("analytics-orders", await query);
    // `items` is jsonb; checkout and the admin editor are its only writers and both store OrderItem[].
    rows.push(...(batch as unknown as Array<Omit<AnalyticsOrderRow, "items"> & { items: OrderItem[] }>));
    if (batch.length < PAGE) return { rows, truncated: false };
  }

  return { rows, truncated: true };
}

/**
 * Every order's customer identity and date, for the new-vs-returning split. It has to span all of
 * history and not just the period: a customer who first ordered last year is not a new one because
 * this month is the first time the dashboard sees them.
 */
export async function loadCustomerHistory(supabase: SupabaseClient<Database>): Promise<CustomerSeenRow[]> {
  const rows: CustomerSeenRow[] = [];

  for (let offset = 0; offset < MAX_CUSTOMER_ROWS; offset += PAGE) {
    const batch = strict(
      "analytics-customers",
      await supabase
        .from("orders")
        .select("user_id, customer_phone, created_at")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1),
    );
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  return rows;
}

/**
 * Product id → the top-level category it belongs to.
 *
 * `orders.items` freezes a product's name and price but not its category, so the only way to group
 * sales by category is to look the products up now — which also means a re-categorised product
 * counts under where it sits today, not where it sat when it sold. The walk up `parent_id` is the
 * same two hops the storefront makes: a product may hang off a subcategory or a sub-subcategory,
 * and neither is what the dashboard wants to list.
 */
export async function loadProductCategories(
  supabase: SupabaseClient<Database>,
  productIds: number[],
): Promise<Map<number, { id: number; name: string }>> {
  const result = new Map<number, { id: number; name: string }>();
  if (productIds.length === 0) return result;

  const categories = strict("analytics-categories", await supabase.from("categories").select("id, name, parent_id"));
  const byId = new Map(categories.map((c) => [c.id, c]));

  const topLevelOf = (categoryId: number | null) => {
    let current = categoryId == null ? undefined : byId.get(categoryId);
    for (let hop = 0; hop < 2 && current?.parent_id != null; hop += 1) current = byId.get(current.parent_id);
    return current ? { id: current.id, name: current.name } : null;
  };

  // `.in()` goes into the URL, so a few thousand ids would overrun the request line.
  const CHUNK = 200;
  for (let i = 0; i < productIds.length; i += CHUNK) {
    const products = strict(
      "analytics-products",
      await supabase
        .from("products")
        .select("id, category_id")
        .in("id", productIds.slice(i, i + CHUNK)),
    );
    for (const product of products) {
      const top = topLevelOf(product.category_id);
      if (top) result.set(product.id, top);
    }
  }

  return result;
}
