export type SortValue = "name" | "popular" | "newest" | "price_asc" | "price_desc";

// Also a cache-budget cap: every distinct ?page= mints an ISR and a Data Cache entry.
const MAX_PAGE = 500;

export function parsePage(page?: string): number {
  const n = Number.parseInt(page ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_PAGE);
}

// /search is public and unthrottled; q reaches an ilike scan, a COUNT and the <title>.
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

// Bounds the URL, not the catalogue: keeps ?price_max=1e308 from reaching a comparison as Infinity.
export const MAX_PRICE = 10_000_000;

export type PriceRange = { min: number | null; max: number | null };

export const EMPTY_PRICE_RANGE: PriceRange = { min: null, max: null };

function parsePriceBound(value?: string): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  // Integers only, so 100 and 100.00 are not two spellings of one filter.
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return Math.min(n, MAX_PRICE);
}

// An inverted range drops both bounds rather than swapping them, on purpose.
export function parsePriceRange(min?: string, max?: string): PriceRange {
  const lo = parsePriceBound(min);
  const hi = parsePriceBound(max);
  if (lo != null && hi != null && lo > hi) return EMPTY_PRICE_RANGE;
  return { min: lo, max: hi };
}

export function hasPriceRange(range: PriceRange): boolean {
  return range.min != null || range.max != null;
}
