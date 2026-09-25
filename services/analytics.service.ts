import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsOrderRow, CustomerSeenRow } from "@/lib/analytics";
import { addDays, shopDayStart } from "@/lib/analytics";
import type { CatalogueBrandRow, CatalogueCategoryRow, CatalogueProductRow } from "@/lib/analytics-insights";
import { loadAllPages, PAGE_ROWS, strict } from "@/lib/db";
import type { OrderItem } from "@/types";
import type { Database } from "@/types/database";

export const MAX_ANALYTICS_ORDERS = 10_000;

const MAX_CUSTOMER_ROWS = 100_000;

const ORDER_COLUMNS = "id, user_id, customer_phone, total, delivery_cost, delivery_type, status, created_at, items";

// toDay is inclusive: the upper bound is the start of the following day.
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
    rows.push(...(batch as unknown as Array<Omit<AnalyticsOrderRow, "items"> & { items: OrderItem[] }>));
    if (batch.length < PAGE_ROWS) return { rows, truncated: false };
  }

  return { rows, truncated: true };
}

// Must span all history, not the period, or returning customers are counted as new.
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

// Whole catalogue, unpublished included on purpose: unsold products and past sales both need it.
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

export async function loadFavoriteCounts(supabase: SupabaseClient<Database>): Promise<Map<number, number>> {
  const rows = await loadAllPages("analytics-favorites", (from, to) =>
    supabase.from("favorites").select("product_id").order("id").range(from, to),
  );
  const counts = new Map<number, number>();
  for (const { product_id } of rows) if (product_id != null) counts.set(product_id, (counts.get(product_id) ?? 0) + 1);
  return counts;
}
