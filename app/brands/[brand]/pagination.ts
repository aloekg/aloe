/**
 * Shared by the page, the infinite-scroll client and the server action, because all three used to
 * agree on 24 by passing it around — including across the wire, where the client's value became
 * part of an `unstable_cache` key. A constant the action reads directly cannot be varied by a
 * caller, so the brand cache key is `(brandId, page)` and nothing else.
 */
export const BRAND_PAGE_SIZE = 24;

/**
 * Well past any brand in a ~2400-product catalogue (200 × 24 = 4800). The generic MAX_PAGE in
 * lib/page-params.ts is about URLs a visitor can type; this one bounds what a public POST can mint
 * in the Data Cache — see "Cache budget" in CODEBASE.md.
 */
export const BRAND_MAX_PAGE = 200;
