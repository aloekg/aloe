/**
 * Cache tags narrower than `products`, and the rule for when the wide one is still needed.
 *
 * `updateTag("products")` marks every cached list, every product and every product page stale at
 * once — and on Vercel's Hobby plan each of those is then rewritten on its next view, three writes
 * per product (page, detail, related). For an edit that changes what a list shows, that is the
 * price of correctness. For approving one review, or fixing a typo in one description, it was a
 * caravan sent to deliver a letter. These tags let those edits expire one product instead.
 *
 * Built by functions rather than written inline so the reader (lib/cached-queries.ts) and the
 * writers (app/admin/actions.ts) cannot drift apart on the spelling.
 */

/** One product's detail, its reviews and its page. */
export function productTag(id: number): string {
  return `product-${id}`;
}

/** The "Похожие товары" pool of one category. */
export function categoryTag(id: number): string {
  return `category-${id}`;
}

/**
 * The product columns a card renders or a list is ordered and filtered by — everything
 * `LIST_COLUMNS` in services/product.service.ts selects that an admin can edit. `description` and
 * `seo_text` are deliberately absent: only the product page shows them.
 */
export const LIST_VISIBLE_PRODUCT_FIELDS = [
  "name",
  "price",
  "old_price",
  "image_url",
  "thumbnail_url",
  "category_id",
  "label",
  "brand_id",
  "published",
] as const;

export type ListVisibleProductFields = Partial<Record<(typeof LIST_VISIBLE_PRODUCT_FIELDS)[number], unknown>>;

/**
 * Whether an edit changes anything a list shows, i.e. whether `products` has to be expired along
 * with the product's own tag. Only keys present in `next` are compared — a partial update that
 * never mentions `price` does not change it — and `null` and `undefined` are treated as the same
 * absence, because the form sends `null` for a cleared field and the row stores `null` too.
 */
export function touchesListings(prev: ListVisibleProductFields, next: ListVisibleProductFields): boolean {
  return LIST_VISIBLE_PRODUCT_FIELDS.some((key) => key in next && (next[key] ?? null) !== (prev[key] ?? null));
}
