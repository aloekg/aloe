"use server";

import { getCachedProductsByBrand } from "@/lib/cached-queries";
import { BRAND_MAX_PAGE, BRAND_PAGE_SIZE } from "./pagination";

/**
 * Public POST endpoint — anyone can call it with any arguments, and its arguments become an
 * `unstable_cache` key. `pageSize` used to be one of them, clamped to 1..48: that bounded the size
 * of each response but not the number of distinct keys, so the 1..48 × 1..10 000 grid was up to
 * 480 000 mintable Data Cache entries per brand at 120 requests a minute. The client only ever sent
 * one value, so it is now a constant the caller cannot reach and the key is `(brandId, page)`.
 *
 * No rate limiter, since that fix. It was here against the key explosion above, and once the page
 * size became a constant and the page number a bounded integer, the set of keys a caller can mint
 * is finite whatever the request rate — while the limiter cost a `rate_limit_hit` round trip to
 * Postgres on every scroll step, ahead of a result that is usually already in the cache.
 */
export async function loadMoreBrandProducts(brandId: number, page: number) {
  const id = Math.trunc(Number(brandId));
  if (!Number.isInteger(id) || id <= 0) return { products: [], total: 0 };

  const safePage = Math.min(Math.max(1, Math.trunc(Number(page)) || 1), BRAND_MAX_PAGE);

  return getCachedProductsByBrand(id, safePage, BRAND_PAGE_SIZE);
}
