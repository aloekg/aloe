import type { SortValue } from "@/components/SortSelect";

/** Guards against `?page=abc` — `Math.max(1, parseInt("abc"))` is NaN, which reaches `.range()`. */
const MAX_PAGE = 10_000;

export function parsePage(page?: string): number {
  const n = Number.parseInt(page ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_PAGE);
}

/**
 * Caps the free-text search term. /search is public, unauthenticated and not rate limited, and `q`
 * reaches an `ilike` scan plus an exact COUNT on every load (services/product.service.ts) as well
 * as the page <title>. Nothing legitimate is anywhere near 100 characters — the header
 * autocomplete will not even fire below three (hooks/useProductAutocomplete.ts).
 */
const MAX_QUERY_LENGTH = 100;

export function parseQuery(q?: string): string {
  return typeof q === "string" ? q.trim().slice(0, MAX_QUERY_LENGTH) : "";
}

export function parseSortParam(sort?: string): SortValue {
  const s = (sort ?? "name") as SortValue;
  return (["name", "price_asc", "price_desc"] as SortValue[]).includes(s) ? s : "name";
}

export function parseBrandIds(brand?: string | string[]): number[] {
  if (!brand) return [];
  return (Array.isArray(brand) ? brand : [brand]).map(Number).filter((id) => Number.isInteger(id) && id > 0);
}
