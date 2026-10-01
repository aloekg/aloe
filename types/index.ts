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
  image_url: string;
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
  rating_sum: number;
  rating_count: number;
};

export type CartItem = {
  id: number;
  name: string;
  price: number;
  image_url: string;
  quantity: number;
};

// Prices resolved server-side at checkout: never build one from client-supplied values.
export type OrderItem = CartItem;

export type ProductRow = Product & { brands: { name: string } | null };

// Card columns only: list queries must not select description/seo_text (2 MB cache entry limit).
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
  // On every row so a cached list can be sorted and rated without minting a cache entry per order.
  purchase_count: number;
  created_at: string;
  rating_sum: number;
  rating_count: number;
};

// Asserted, not inferred: category_id is nullable, but the published-has-category CHECK guarantees it here.
export type ProductListRow = Omit<ProductListItem, "brand_name"> & { brands: { name: string } | null };

export function withBrandName<T extends { brands?: { name: string } | null }>(
  rows: T[],
): Array<Omit<T, "brands"> & { brand_name: string | null }> {
  return rows.map(({ brands, ...rest }) => ({ ...rest, brand_name: brands?.name ?? null }));
}

export type ProductRecord = Tables["products"]["Row"];

export type Category = Tables["categories"]["Row"];
export type Banner = Tables["banners"]["Row"];
export type Profile = Tables["profiles"]["Row"];
export type ProfileFields = Pick<Profile, "name" | "phone" | "address">;
export type Order = Omit<Tables["orders"]["Row"], "items"> & { items: OrderItem[] };

export type Review = Tables["reviews"]["Row"];

export type ReviewWithProduct = Review & {
  products: { id: number; name: string; thumbnail_url: string | null } | null;
};
