/**
 * The catalogue's sort orders. Declared here, with the other URL helpers, because that is what they
 * are: a `?sort=` value. There were three copies of this union — one in the `"use client"`
 * SortSelect that this server module imported from, one in product.service.ts — which is three
 * places for a three-member union to drift.
 */
export type SortValue = "name" | "popular" | "newest" | "price_asc" | "price_desc";

/**
 * Guards against `?page=abc` — `Math.max(1, parseInt("abc"))` is NaN, which reaches `.range()`.
 *
 * The ceiling is also a cache-budget control, which is why it is 500 and not 10 000. Every distinct
 * `?page=` on /new, /sale and /popular mints both a Data Cache entry and an ISR entry, and on
 * Vercel's Hobby plan those are the one metric this project has come close to exhausting (see
 * "Cache budget" in CODEBASE.md). At 20-24 products a page, 500 covers ten times the catalogue;
 * everything above it was an empty, indexable 200 that anyone could mint at will.
 */
const MAX_PAGE = 500;

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

const SORT_VALUES: SortValue[] = ["name", "popular", "newest", "price_asc", "price_desc"];

export function parseSortParam(sort?: string): SortValue {
  const s = (sort ?? "name") as SortValue;
  return SORT_VALUES.includes(s) ? s : "name";
}

export function parseBrandIds(brand?: string | string[]): number[] {
  if (!brand) return [];
  return (Array.isArray(brand) ? brand : [brand]).map(Number).filter((id) => Number.isInteger(id) && id > 0);
}

/**
 * The largest price a `?price_min=` / `?price_max=` may name. Not a catalogue fact — the most
 * expensive product is three orders of magnitude below it — but a bound on what the URL may say, so
 * `?price_max=1e308` cannot reach a comparison as Infinity.
 */
export const MAX_PRICE = 10_000_000;

export type PriceRange = { min: number | null; max: number | null };

export const EMPTY_PRICE_RANGE: PriceRange = { min: null, max: null };

function parsePriceBound(value?: string): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  // Integers only: сом are not quoted in tiyin anywhere in this catalogue, and accepting decimals
  // would make `?price_min=100.00` and `?price_min=100` two spellings of one filter.
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return Math.min(n, MAX_PRICE);
}

/**
 * The price range a URL asks for, or nulls where it asked for nothing coherent. Like `parsePage`,
 * this exists so a hand-typed parameter cannot reach a comparison as NaN.
 *
 * An inverted range drops *both* bounds rather than swapping them: the filter UI renders from what
 * this returns, so swapping would show the customer a range they did not type, while dropping shows
 * them the unfiltered list their impossible range actually matches.
 */
export function parsePriceRange(min?: string, max?: string): PriceRange {
  const lo = parsePriceBound(min);
  const hi = parsePriceBound(max);
  if (lo != null && hi != null && lo > hi) return EMPTY_PRICE_RANGE;
  return { min: lo, max: hi };
}

export function hasPriceRange(range: PriceRange): boolean {
  return range.min != null || range.max != null;
}
