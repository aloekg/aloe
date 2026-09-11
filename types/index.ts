import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];

export type Brand = {
  id: number;
  name: string;
  slug: string;
};

export type Product = {
  id: number;
  name: string;
  price: number;
  /** Large image (≤1200px) for the detail page and quick-view modal. */
  image_url: string;
  /** Small card variant (≤500px). Null on rows not backfilled yet — fall back to `image_url`. */
  thumbnail_url?: string | null;
  category: string;
  category_id: number;
  label?: "new" | "sale" | null;
  old_price?: number | null;
  description?: string | null;
  brand_id?: number | null;
  brand_name?: string | null;
  seo_text?: string | null;
  purchase_count: number;
  published: boolean;
};

export type CartItem = {
  id: number;
  name: string;
  price: number;
  image_url: string;
  quantity: number;
};

/**
 * A cart item frozen into an order. Same shape as `CartItem`, but every field here was
 * resolved server-side at checkout — never trust a client-supplied price with this type.
 */
export type OrderItem = CartItem;

export type ProductRow = Product & { brands: { name: string } | null };

/**
 * Exactly what a product card renders. List queries select these columns and nothing else —
 * `description` and `seo_text` are long free text and otherwise dominate every grid payload,
 * which is also what pushes cached category pages past the 2 MB data-cache entry limit.
 * The detail page still loads the full `Product`.
 */
export type ProductListItem = {
  id: number;
  name: string;
  price: number;
  old_price?: number | null;
  image_url: string;
  thumbnail_url?: string | null;
  category_id: number;
  label?: "new" | "sale" | null;
  brand_id?: number | null;
  brand_name?: string | null;
};

/**
 * The shape a list query returns, before `withBrandName` flattens the join.
 *
 * List queries assert their rows into this rather than inferring them, because one column cannot
 * line up: `products.category_id` is nullable in the schema — an uncategorised draft is a real
 * state, 91 rows are in it after the old category FK stripped them — while `ProductListItem`
 * requires it. Every list query filters on `published`, and the `products_published_has_category`
 * CHECK guarantees a published row is categorised, so the assertion holds. It is a database
 * invariant that type generation cannot see, not a nullability that was papered over:
 * price/image_url/published were the papered-over ones, and they are NOT NULL as of
 * supabase/migrations/20260911120400_not_null_columns.sql.
 */
export type ProductListRow = Omit<ProductListItem, "brand_name"> & { brands: { name: string } | null };

export function withBrandName<T extends { brands?: { name: string } | null }>(
  rows: T[],
): Array<Omit<T, "brands"> & { brand_name: string | null }> {
  return rows.map(({ brands, ...rest }) => ({ ...rest, brand_name: brands?.name ?? null }));
}

/**
 * Derived from the generated schema rather than hand-written, so a renamed or newly-nullable
 * column fails the build instead of surfacing at runtime. `orders.items` is jsonb, typed here as
 * what checkout actually writes into it.
 */
/**
 * A raw products row, exactly as stored. The admin list and edit drawer work with these; the
 * storefront uses `Product`/`ProductListItem`. price, image_url and published are NOT NULL as of
 * the migration above; `category_id`/`category` stay nullable for uncategorised drafts, which is
 * why the admin types have to keep handling their absence — see supabase/README.md.
 */
export type ProductRecord = Tables["products"]["Row"];

export type Category = Tables["categories"]["Row"];
export type Banner = Tables["banners"]["Row"];
export type Profile = Tables["profiles"]["Row"];
/** What profile.service selects and ProfileForm edits. */
export type ProfileFields = Pick<Profile, "name" | "phone" | "address">;
export type Order = Omit<Tables["orders"]["Row"], "items"> & { items: OrderItem[] };
