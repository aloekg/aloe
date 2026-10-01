import { hasPriceRange, type PriceRange, type SortValue } from "@/lib/page-params";
import type { ProductListItem } from "@/types";

// Must stay pure and deterministic: server and client both run it, so any difference is a hydration mismatch.

type Priced = Pick<ProductListItem, "id" | "price">;

type Sortable = Priced & Pick<ProductListItem, "purchase_count" | "created_at">;

export function filterByPrice<T extends Priced>(products: readonly T[], range: PriceRange): readonly T[] {
  if (!hasPriceRange(range)) return products;
  return products.filter(
    (p) => (range.min == null || p.price >= range.min) && (range.max == null || p.price <= range.max),
  );
}

// `name` keeps the query's order: JS collation differs from Postgres for Cyrillic.
// Other orders break ties by id so the server and the client sort identically.
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

export function applyProductFilters<T extends Sortable>(
  products: readonly T[],
  range: PriceRange,
  sort: SortValue,
): readonly T[] {
  return sortProducts(filterByPrice(products, range), sort);
}

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

export type FilterableSection<T> = {
  id: number;
  name: string;
  products: T[];
  groups?: { id: number; name: string; products: T[] }[];
};

// Sorts within each section, never across: flattening breaks the pills, section scroll and ?sub= links.
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
