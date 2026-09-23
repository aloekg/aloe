import { hasPriceRange, type PriceRange, type SortValue } from "@/lib/page-params";
import type { ProductListItem } from "@/types";

/**
 * Sorting and price filtering, as pure array operations.
 *
 * They live here rather than in a query because the catalogue's list queries are cached, and
 * `unstable_cache` folds every argument into the key: a sort order and a price range in the
 * signature of `getCachedCategoryProducts` would multiply the ~90 KB entries it mints for one
 * payload (see "Cache budget" in CODEBASE.md). So the cache holds the category, and these run on
 * what it returns — on the server for the first render, and again on the client when the customer
 * moves a control. That is also why they must be pure and deterministic: the two sides render the
 * same array and any disagreement between them is a hydration mismatch on the busiest page of the
 * site.
 *
 * /search is the exception and does not use these: it is not cached at all, so there is no key to
 * inflate, and its COUNT — which decides how many pages exist — has to come from the database
 * already filtered.
 */

type Priced = Pick<ProductListItem, "id" | "price">;

/** What ordering needs on top of a price: the two columns the extra sort orders read. */
type Sortable = Priced & Pick<ProductListItem, "purchase_count" | "created_at">;

/** Inclusive on both bounds, and a range that names neither returns the input untouched. */
export function filterByPrice<T extends Priced>(products: readonly T[], range: PriceRange): readonly T[] {
  if (!hasPriceRange(range)) return products;
  return products.filter(
    (p) => (range.min == null || p.price >= range.min) && (range.max == null || p.price <= range.max),
  );
}

/**
 * `name` returns the input untouched: the query already ordered by name, and re-sorting it here
 * would apply JS string collation to rows Postgres ordered by its own, quietly producing a
 * different order for the Cyrillic names that are most of this catalogue.
 *
 * Every other order **breaks ties by `id`**. Without that, `Array.prototype.sort` is free to order
 * equal keys differently on the server and in the browser, and this array is sorted on both sides —
 * a hydration mismatch. The tie matters most for "Популярные": four products in five have a
 * `purchase_count` of 0, so almost the whole catalogue is one tie.
 *
 * "Новые" compares parsed timestamps rather than the ISO strings. PostgREST returns them all with
 * the same `+00:00` offset today, which would make a string compare work by coincidence; parsing
 * costs nothing at these sizes and does not depend on that.
 */
export function sortProducts<T extends Sortable>(products: readonly T[], sort: SortValue): readonly T[] {
  if (sort === "name") return products;

  const key: (p: T) => number =
    sort === "popular"
      ? (p) => -p.purchase_count
      : sort === "newest"
        ? (p) => -Date.parse(p.created_at)
        : sort === "price_desc"
          ? (p) => -p.price
          : (p) => p.price;

  return [...products].sort((a, b) => {
    const diff = key(a) - key(b);
    return diff === 0 || Number.isNaN(diff) ? a.id - b.id : diff;
  });
}

/** Both in one pass, in the order the storefront wants them: narrow first, then order. */
export function applyProductFilters<T extends Sortable>(
  products: readonly T[],
  range: PriceRange,
  sort: SortValue,
): readonly T[] {
  return sortProducts(filterByPrice(products, range), sort);
}

/**
 * The cheapest and dearest of a set, for the filter inputs' placeholders — so the customer is
 * offered the range that exists rather than an empty box. Null when there is nothing to bound.
 */
export function priceBounds(products: readonly Priced[]): { min: number; max: number } | null {
  if (products.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const p of products) {
    if (p.price < min) min = p.price;
    if (p.price > max) max = p.price;
  }
  return { min: Math.floor(min), max: Math.ceil(max) };
}

/**
 * The category page's shape: one section per subcategory, optionally split into per-sub-subcategory
 * groups. Structural only — the products are whatever the caller holds.
 */
export type FilterableSection<T> = {
  id: number;
  name: string;
  products: T[];
  groups?: { id: number; name: string; products: T[] }[];
};

/**
 * Narrows and orders a category's sections *within* each section and group, leaving the order of
 * the sections themselves alone.
 *
 * That is deliberate rather than incidental. Flattening the page into one price-ordered grid would
 * break five things at once: the subcategory pills, `lib/section-scroll.ts`, `lib/active-section.ts`,
 * the `?sub=` contract those two maintain, and the `/catalog/[top]?sub=[sub]` links the breadcrumbs,
 * the homepage and the sitemap point at. So "сначала дешевле" means "cheapest first in each
 * section", and the UI says so.
 *
 * Emptied groups and emptied sections are dropped, which is what keeps a pill from scrolling to
 * nothing — the same rule the page already applies to a subcategory with no products at all.
 */
export function filterCategorySections<T extends Sortable, S extends FilterableSection<T>>(
  sections: readonly S[],
  range: PriceRange,
  sort: SortValue,
): S[] {
  if (!hasPriceRange(range) && sort === "name") return sections as S[];

  const result: S[] = [];
  for (const section of sections) {
    const products = applyProductFilters(section.products, range, sort) as T[];
    const groups = section.groups
      ?.map((g) => ({ ...g, products: applyProductFilters(g.products, range, sort) as T[] }))
      .filter((g) => g.products.length > 0);
    if (products.length === 0 && !groups?.length) continue;
    result.push({ ...section, products, groups } as S);
  }
  return result;
}
