import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { strict } from "@/lib/db";
import type { SortValue } from "@/lib/page-params";
import type { ProductListItem, ProductListRow } from "@/types";
import { withBrandName } from "@/types";
import type { Database } from "@/types/database";

/**
 * The only columns a product card needs. Selecting `*` here pulls `description` and `seo_text`
 * — long free text — into every grid, carousel and RSC payload on the site.
 */
const LIST_COLUMNS =
  "id, name, price, old_price, image_url, thumbnail_url, category_id, label, brand_id, purchase_count, created_at, rating_sum, rating_count, brands(name)";

/**
 * Stays "exact": these totals are user-visible ("Смотреть все N") and on the homepage
 * `total > 0` decides whether a carousel renders at all — a planner estimate can be 0 for a
 * non-empty set. Where the total equals the number of rows returned, we skip the count instead.
 */
const COUNT: { count: "exact" } = { count: "exact" };

function toList(
  label: string,
  { data, count, error }: { data: unknown; count: number | null; error: PostgrestError | null },
): { products: ProductListItem[]; total: number } {
  if (error) console.error(`[${label}] ${error.message}`);
  return { products: withBrandName((data ?? []) as ProductListRow[]), total: count ?? 0 };
}

/**
 * `%` and `_` are LIKE wildcards and PostgREST additionally rewrites `*` to `%`, so an
 * unescaped search term of `%` or `*` matches the entire catalogue — a full sequential scan
 * plus an exact COUNT over every row.
 */
export function escapeLike(value: string): string {
  return value.replace(/\*/g, "").replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * An admin search term made only of digits also names a product id.
 *
 * Returned separately rather than switched on inside the query so the caller can *add* an exact-id
 * match without taking anything away: searching "500" must still find "500 мл". The id is returned
 * as the validated string because it goes straight into a PostgREST `.or()` filter — that filter is
 * a parsed expression, not a bound parameter (see escapeOrFilterValue in order.service.ts for what
 * happens when user text reaches one), and digits are the one input that needs no escaping at all.
 *
 * Capped at 15 digits: anything wider than bigint makes Postgres reject the whole query rather than
 * simply match nothing.
 */
export function parseProductId(q: string): string | null {
  const value = q.trim();
  return /^\d{1,15}$/.test(value) ? value : null;
}

function range(page: number, pageSize: number): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

/** Upper bound for the admin list's "показать все" mode. */
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

/**
 * One limited query per top-level category, run in parallel. The previous version fetched every
 * published product in every category in a single unbounded query and sliced to ten in JS —
 * effectively `select * from products` on each homepage revalidation, silently truncated by
 * PostgREST's max-rows (which also made `total` wrong).
 */
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
  // maybeSingle, not single: "no rows" is an ordinary miss here, and single() reports it with the
  // same PGRST116 code it uses for "more than one row" — which would hide a duplicate id.
  return supabase.from("products").select("*, brands(name, slug)").eq("id", id).eq("published", true).maybeSingle();
}

/** How many "Похожие товары" the product page shows. */
export const RELATED_PRODUCTS_LIMIT = 4;

/**
 * The pool "Похожие товары" is drawn from — a whole category's first few products, with the product
 * being viewed still in it. Excluding it here instead would put its id in the cache key, and the
 * caller caches this: one entry per product (2400+) rather than one per category (~90), each
 * rewritten on every expiry. The caller drops itself from the pool, which is why this fetches one
 * more row than it shows — so a product inside its own pool still has four neighbours left.
 */
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

/**
 * Products for a whole top-level category in one query, keyed by category id.
 *
 * The category page used to call a per-subcategory variant of this inside a Promise.all — one
 * round trip per subcategory, fifteen for a large category. Since every section is rendered on
 * the same page anyway, a single `in` over the union costs one query and lets the caller bucket
 * the rows. Still deliberately unbounded: the page renders all sections in one virtualized
 * scroll, so a cap would silently hide products. With the narrow column list the payload for the
 * largest category measures ~90 KB, well inside the 2 MB data-cache entry limit.
 */
export async function getCategoryProducts(
  supabase: SupabaseClient<Database>,
  categoryIds: number[],
): Promise<Map<number, ProductListItem[]>> {
  const byCategory = new Map<number, ProductListItem[]>();
  if (categoryIds.length === 0) return byCategory;

  // Deliberately no brand filter, no sort and no price range here. The caller caches this, and
  // `unstable_cache` folds every argument into the key — so a brand facet on the category page
  // would mint a ~90 KB entry per subset of brands, and a sort order or a price range would
  // multiply that again, the same explosion `excludeId` used to cause for related products. Sort
  // belonged to this signature until the storefront gained a control for it, and cost up to three
  // entries per category for a feature no UI exposed. All three belong on the cached result, not
  // in the query — see lib/price-filter.ts and "Cache budget" in CODEBASE.md.
  const query = supabase.from("products").select(LIST_COLUMNS).eq("published", true).in("category_id", categoryIds);

  // strict: the category page calls notFound() when no section has products, so swallowing an
  // error here would turn an outage into a 404 that then gets cached for 60 seconds.
  const data = strict("category-products", await query.order("name").order("id"));

  for (const row of withBrandName(data as ProductListRow[])) {
    const bucket = byCategory.get(row.category_id);
    if (bucket) bucket.push(row);
    else byCategory.set(row.category_id, [row]);
  }
  return byCategory;
}

/**
 * Unlike the category page, search filters and sorts in the query rather than on the result. It can
 * afford to: nothing here is wrapped in `unstable_cache`, so there is no key to inflate. And it has
 * to: the page count comes from this request's COUNT, which is only right if the database counted
 * what the customer actually asked for.
 */
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

  // `id` last in every order: it breaks ties deterministically, so a product on a page boundary
  // cannot appear on both pages or on neither as the customer walks through them.
  if (sort === "price_asc" || sort === "price_desc") q = q.order("price", { ascending: sort === "price_asc" });
  else if (sort === "popular") q = q.order("purchase_count", { ascending: false });
  else if (sort === "newest") q = q.order("created_at", { ascending: false });
  else q = q.order("name");

  const res = await q.order("id").range(from, from + pageSize - 1);
  return toList("search", res);
}

/**
 * How many pages of matches the brand facet will scan. PostgREST caps a request at 1000 rows, and
 * a flat `.limit(1000)` meant a broad search silently dropped every brand whose products happened
 * to sort past the first thousand — the filter then had no way to reach them and nothing said so.
 * Five pages covers twice the current catalogue; past that the facet is approximate rather than
 * wrong in a way the UI cannot see, which is the trade a full scan on an unrated public route
 * cannot justify.
 */
const BRAND_FACET_MAX_PAGES = 5;

/**
 * Brand ids present in a search's results. Returns ids rather than joined rows: `brands(id, name)`
 * made every page of this carry a join purely to recover names the caller already holds from
 * `getCachedBrands()`, and the names are what the caller sorts and renders anyway.
 */
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

  // Stays `select("*")` — the edit drawer needs description/seo_text/published.
  let query = supabase.from("products").select("*", { count: "exact" });
  // A digits-only term matches the id as well as the name, so pasting an id from a report or a URL
  // finds the row. Additive on purpose — nothing that matched before stops matching.
  const idTerm = parseProductId(q);
  if (idTerm) query = query.or(`id.eq.${idTerm},name.ilike.%${idTerm}%`);
  else if (q) query = query.ilike("name", `%${escapeLike(q)}%`);
  // "none" mirrors the label filter: the products orphaned by the category FK's old
  // ON DELETE SET NULL are otherwise unreachable — nothing else in the admin can single out a
  // row whose category is missing, and they cannot be published until one is assigned.
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

  // "all" still gets an upper bound — the bulk-edit view would otherwise select every column
  // of every product in one response.
  query = pageSize === "all" ? query.range(0, ADMIN_ALL_CAP - 1) : query.range(...range(page, pageSize));

  const { data, count, error } = await query;
  if (error) console.error(`[admin-products] ${error.message}`);
  return { products: data ?? [], total: count ?? 0 };
}

/**
 * Distinct id lookups, paged past PostgREST's max-rows. Without paging these silently returned
 * only the first 1000 products' worth of ids, and the admin UI used the result to decide whether
 * a category or brand was safe to delete — so an in-use one could be reported as unused.
 */
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
