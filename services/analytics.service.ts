import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsOrderRow, CustomerSeenRow } from "@/lib/analytics";
import { addDays, shopDayStart } from "@/lib/analytics";
import type { CatalogueBrandRow, CatalogueCategoryRow, CatalogueProductRow } from "@/lib/analytics-insights";
import { loadAllPages, PAGE_ROWS, strict } from "@/lib/db";
import type { OrderItem } from "@/types";
import type { Database } from "@/types/database";

/**
 * Reads for the admin dashboard. The aggregation itself is in `lib/analytics.ts`; this file only
 * gets the rows out of Postgres, which PostgREST hands over 1000 at a time whatever `.range()` asks
 * for — hence the paging loops. Every caller is already behind `requireAdmin()`.
 */

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

  for (let offset = 0; offset < MAX_ANALYTICS_ORDERS; offset += PAGE_ROWS) {
    let query = supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .lt("created_at", shopDayStart(addDays(toDay, 1)).toISOString())
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, Math.min(offset + PAGE_ROWS, MAX_ANALYTICS_ORDERS) - 1);
    if (fromDay) query = query.gte("created_at", shopDayStart(fromDay).toISOString());

    const batch = strict("analytics-orders", await query);
    // `items` is jsonb; checkout and the admin editor are its only writers and both store OrderItem[].
    rows.push(...(batch as unknown as Array<Omit<AnalyticsOrderRow, "items"> & { items: OrderItem[] }>));
    if (batch.length < PAGE_ROWS) return { rows, truncated: false };
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

  for (let offset = 0; offset < MAX_CUSTOMER_ROWS; offset += PAGE_ROWS) {
    const batch = strict(
      "analytics-customers",
      await supabase
        .from("orders")
        .select("user_id, customer_phone, created_at, status")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_ROWS - 1),
    );
    rows.push(...batch);
    if (batch.length < PAGE_ROWS) break;
  }

  return rows;
}

/**
 * The whole catalogue, a handful of columns per product. Loaded in full rather than by the ids that
 * sold, because two of the dashboard's questions are about the products that did *not*: which
 * published ones had no sale, and which promo ones. ~2400 narrow rows is three requests.
 *
 * Unpublished products are included on purpose — a product sold last month and unpublished since
 * still belongs to its category and brand in the sales breakdown.
 */
export async function loadCatalogue(supabase: SupabaseClient<Database>): Promise<{
  products: CatalogueProductRow[];
  categories: CatalogueCategoryRow[];
  brands: CatalogueBrandRow[];
}> {
  const [products, categories, brands] = await Promise.all([
    loadAllPages("analytics-products", (from, to) =>
      supabase
        .from("products")
        .select("id, name, price, old_price, label, brand_id, category_id, published, purchase_count, created_at")
        .order("id")
        .range(from, to),
    ),
    loadAllPages("analytics-categories", (from, to) =>
      supabase.from("categories").select("id, name, parent_id").order("id").range(from, to),
    ),
    loadAllPages("analytics-brands", (from, to) =>
      supabase.from("brands").select("id, name").order("id").range(from, to),
    ),
  ]);
  return { products, categories, brands };
}

/**
 * How many accounts hold each product in their favorites. There is no aggregate endpoint without an
 * RPC, so the ids are counted here — one narrow column, and only signed-in customers have favorites.
 */
export async function loadFavoriteCounts(supabase: SupabaseClient<Database>): Promise<Map<number, number>> {
  const rows = await loadAllPages("analytics-favorites", (from, to) =>
    supabase.from("favorites").select("product_id").order("id").range(from, to),
  );
  const counts = new Map<number, number>();
  for (const { product_id } of rows) if (product_id != null) counts.set(product_id, (counts.get(product_id) ?? 0) + 1);
  return counts;
}
