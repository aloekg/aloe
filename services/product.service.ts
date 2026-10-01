import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { loadAllPages } from "@/lib/db";
import type { SortValue } from "@/lib/page-params";
import type { ProductListItem, ProductListRow } from "@/types";
import { withBrandName } from "@/types";
import type { Database } from "@/types/database";

// Never "*": description/seo_text would bloat every grid payload and cache entry.
const LIST_COLUMNS =
  "id, name, price, old_price, image_url, thumbnail_url, category_id, label, brand_id, purchase_count, created_at, rating_sum, rating_count, brands(name)";

// Must stay "exact": the homepage hides a carousel when total is 0, and an estimate can be 0.
const COUNT: { count: "exact" } = { count: "exact" };

function toList(
  label: string,
  { data, count, error }: { data: unknown; count: number | null; error: PostgrestError | null },
): { products: ProductListItem[]; total: number } {
  if (error) console.error(`[${label}] ${error.message}`);
  return { products: withBrandName((data ?? []) as ProductListRow[]), total: count ?? 0 };
}

// PostgREST rewrites * to %, so an unescaped "%" or "*" matches the whole catalogue.
export function escapeLike(value: string): string {
  return value.replace(/\*/g, "").replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Digits only (max 15, or Postgres rejects the query): the result goes unescaped into a PostgREST .or().
export function parseProductId(q: string): string | null {
  const value = q.trim();
  return /^\d{1,15}$/.test(value) ? value : null;
}

function range(page: number, pageSize: number): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

const ADMIN_ALL_CAP = 5000;

export type AdminProductsSort = "id-desc" | "name-asc" | "price-asc" | "price-desc" | "purchase-count-desc";

export async function getProductsByLabel(supabase: SupabaseClient<Database>, label: "new" | "sale", limit = 10) {
  const res = await supabase
    .from("products")
    .select(LIST_COLUMNS, COUNT)
    .eq("published", true)
    .eq("label", label)
    .order("id", { ascending: false })
    .limit(limit);
  return toList("products-by-label", res);
}

export async function getPopularProducts(supabase: SupabaseClient<Database>, limit = 10) {
  const res = await supabase
    .from("products")
    .select(LIST_COLUMNS, COUNT)
    .eq("published", true)
    .gt("purchase_count", 0)
    .order("purchase_count", { ascending: false })
    .order("id")
    .limit(limit);
  return toList("popular-products", res);
}

export async function getPopularProductsPaginated(
  supabase: SupabaseClient<Database>,
  options: { page: number; pageSize?: number },
) {
  const { page, pageSize = 20 } = options;
  const res = await supabase
    .from("products")
    .select(LIST_COLUMNS, COUNT)
    .eq("published", true)
    .gt("purchase_count", 0)
    .order("purchase_count", { ascending: false })
    .order("id")
    .range(...range(page, pageSize));
  return toList("popular-paginated", res);
}

export async function getHomePageCategoryProducts(
  supabase: SupabaseClient<Database>,
  groups: Array<{ topId: number; allIds: number[] }>,
  limitPerCategory = 10,
) {
  return Promise.all(
    groups.map(async ({ topId, allIds }) => {
      if (allIds.length === 0) return { topId, products: [], total: 0 };
      const res = await supabase
        .from("products")
        .select(LIST_COLUMNS, COUNT)
        .eq("published", true)
        .in("category_id", allIds)
        .order("name")
        .limit(limitPerCategory);
      const { products, total } = toList("home-category-products", res);
      return { topId, products, total };
    }),
  );
}

export async function getProduct(supabase: SupabaseClient<Database>, id: number) {
  // maybeSingle, not single: single reports zero rows and duplicates with the same PGRST116 code.
  return supabase.from("products").select("*, brands(name, slug)").eq("id", id).eq("published", true).maybeSingle();
}

export const RELATED_PRODUCTS_LIMIT = 4;

// Keep excludeId out of the cached key (one entry per product); fetches limit + 1 and the caller drops itself.
export async function getRelatedProducts(
  supabase: SupabaseClient<Database>,
  categoryId: number,
  limit = RELATED_PRODUCTS_LIMIT + 1,
) {
  const res = await supabase
    .from("products")
    .select(LIST_COLUMNS)
    .eq("published", true)
    .eq("category_id", categoryId)
    .order("id")
    .limit(limit);
  if (res.error) console.error(`[related-products] ${res.error.message}`);
  return withBrandName((res.data ?? []) as ProductListRow[]);
}

// Unbounded on purpose, paged through loadAllPages: a cap would silently hide products.
export async function getCategoryProducts(
  supabase: SupabaseClient<Database>,
  categoryIds: number[],
): Promise<Map<number, ProductListItem[]>> {
  const byCategory = new Map<number, ProductListItem[]>();
  if (categoryIds.length === 0) return byCategory;

  // No brand/sort/price arguments: each becomes an unstable_cache key. Filter the cached result instead.
  // Must throw on failure: an empty result would become a cached notFound().
  const data = await loadAllPages("category-products", (from, to) =>
    supabase
      .from("products")
      .select(LIST_COLUMNS)
      .eq("published", true)
      .in("category_id", categoryIds)
      .order("name")
      .order("id")
      .range(from, to),
  );

  for (const row of withBrandName(data as ProductListRow[])) {
    const bucket = byCategory.get(row.category_id);
    if (bucket) bucket.push(row);
    else byCategory.set(row.category_id, [row]);
  }
  return byCategory;
}

// Filters in SQL on purpose: uncached, and the page count comes from this COUNT.
export async function searchProducts(
  supabase: SupabaseClient<Database>,
  query: string,
  options: {
    brandIds?: number[];
    page: number;
    pageSize?: number;
    priceMin?: number | null;
    priceMax?: number | null;
    sort?: SortValue;
  },
) {
  const { brandIds = [], page, pageSize = 24, priceMin = null, priceMax = null, sort = "name" } = options;
  const from = (page - 1) * pageSize;

  let q = supabase
    .from("products")
    .select(LIST_COLUMNS, COUNT)
    .eq("published", true)
    .ilike("name", `%${escapeLike(query)}%`);

  if (brandIds.length > 0) q = q.in("brand_id", brandIds);
  if (priceMin != null) q = q.gte("price", priceMin);
  if (priceMax != null) q = q.lte("price", priceMax);

  // id last in every order as a tiebreak, so pages never overlap or skip.
  if (sort === "price_asc" || sort === "price_desc") q = q.order("price", { ascending: sort === "price_asc" });
  else if (sort === "popular") q = q.order("purchase_count", { ascending: false });
  else if (sort === "newest") q = q.order("created_at", { ascending: false });
  else q = q.order("name");

  const res = await q.order("id").range(from, from + pageSize - 1);
  return toList("search", res);
}

const BRAND_FACET_MAX_PAGES = 5;

export async function getBrandIdsForSearch(supabase: SupabaseClient<Database>, query: string): Promise<number[]> {
  const pageSize = 1000;
  const ids = new Set<number>();

  for (let page = 0; page < BRAND_FACET_MAX_PAGES; page++) {
    const from = page * pageSize;
    const { data, error } = await supabase
      .from("products")
      .select("brand_id")
      .eq("published", true)
      .ilike("name", `%${escapeLike(query)}%`)
      .not("brand_id", "is", null)
      .order("brand_id")
      .order("id")
      .range(from, from + pageSize - 1);

    if (error) {
      console.error(`[brands-for-search] ${error.message}`);
      break;
    }
    for (const row of data ?? []) if (row.brand_id != null) ids.add(row.brand_id);
    if ((data?.length ?? 0) < pageSize) break;
  }

  return [...ids];
}

export async function getProductsByBrand(
  supabase: SupabaseClient<Database>,
  brandId: number,
  options: { page: number; pageSize?: number },
) {
  const { page, pageSize = 24 } = options;
  const res = await supabase
    .from("products")
    .select(LIST_COLUMNS, COUNT)
    .eq("published", true)
    .eq("brand_id", brandId)
    .order("name")
    .order("id")
    .range(...range(page, pageSize));
  return toList("products-by-brand", res);
}

export async function getProductsByLabelPaginated(
  supabase: SupabaseClient<Database>,
  label: string,
  options: { page: number; pageSize?: number },
) {
  const { page, pageSize = 20 } = options;
  const res = await supabase
    .from("products")
    .select(LIST_COLUMNS, COUNT)
    .eq("published", true)
    .eq("label", label)
    .order("name")
    .order("id")
    .range(...range(page, pageSize));
  return toList("label-paginated", res);
}

export async function searchProductsAutocomplete(supabase: SupabaseClient<Database>, query: string, limit = 6) {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, price, image_url, thumbnail_url, category_id")
    .eq("published", true)
    .ilike("name", `%${escapeLike(query)}%`)
    .order("id")
    .limit(limit);
  if (error) console.error(`[autocomplete] ${error.message}`);
  return data ?? [];
}

export async function getAdminProducts(
  supabase: SupabaseClient<Database>,
  options: {
    q?: string;
    label?: string;
    published?: string;
    categoryId?: number | "none";
    sort?: AdminProductsSort;
    page?: number;
    pageSize?: number | "all";
  },
) {
  const { q = "", label = "", published = "", categoryId, sort = "id-desc", page = 1, pageSize = 20 } = options;

  // select("*") on purpose: the edit drawer needs description/seo_text/published.
  let query = supabase.from("products").select("*", { count: "exact" });
  const idTerm = parseProductId(q);
  if (idTerm) query = query.or(`id.eq.${idTerm},name.ilike.%${idTerm}%`);
  else if (q) query = query.ilike("name", `%${escapeLike(q)}%`);
  if (categoryId === "none") query = query.is("category_id", null);
  else if (categoryId) query = query.eq("category_id", categoryId);
  if (label === "none") query = query.is("label", null);
  else if (label) query = query.eq("label", label);
  if (published === "yes") query = query.eq("published", true);
  else if (published === "no") query = query.eq("published", false);
  if (sort === "name-asc") query = query.order("name");
  else if (sort === "price-asc") query = query.order("price", { ascending: true });
  else if (sort === "price-desc") query = query.order("price", { ascending: false });
  else if (sort === "purchase-count-desc") query = query.order("purchase_count", { ascending: false });
  else query = query.order("created_at", { ascending: false }).order("id", { ascending: false });

  query = pageSize === "all" ? query.range(0, ADMIN_ALL_CAP - 1) : query.range(...range(page, pageSize));

  const { data, count, error } = await query;
  if (error) console.error(`[admin-products] ${error.message}`);
  return { products: data ?? [], total: count ?? 0 };
}

// Paged past the 1000-row cap: the result decides whether a category/brand is safe to delete.
async function distinctIds(supabase: SupabaseClient<Database>, column: "category_id" | "brand_id"): Promise<number[]> {
  const pageSize = 1000;
  const ids = new Set<number>();
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("products")
      .select(column)
      .not(column, "is", null)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) {
      console.error(`[products] distinct ${column} failed:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      const value = (row as Record<string, unknown>)[column];
      if (typeof value === "number") ids.add(value);
    }
    if (data.length < pageSize) break;
  }
  return [...ids];
}

export async function getProductCategoryIds(supabase: SupabaseClient<Database>) {
  return distinctIds(supabase, "category_id");
}

export async function getProductBrandIds(supabase: SupabaseClient<Database>) {
  return distinctIds(supabase, "brand_id");
}
