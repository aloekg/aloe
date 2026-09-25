export function productTag(id: number): string {
  return `product-${id}`;
}

export function categoryTag(id: number): string {
  return `category-${id}`;
}

// Mirrors the admin-editable LIST_COLUMNS in product.service.ts; description/seo_text stay out on purpose.
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

export function touchesListings(prev: ListVisibleProductFields, next: ListVisibleProductFields): boolean {
  return LIST_VISIBLE_PRODUCT_FIELDS.some((key) => key in next && (next[key] ?? null) !== (prev[key] ?? null));
}
