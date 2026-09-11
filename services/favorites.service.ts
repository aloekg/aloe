import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductListRow } from "@/types";
import { withBrandName } from "@/types";
import type { Database } from "@/types/database";

/** Mirrors LIST_COLUMNS in product.service.ts — the favorites grid renders the same card. */
const FAVORITE_PRODUCT_COLUMNS =
  "id, name, price, old_price, image_url, thumbnail_url, category_id, label, brand_id, brands(name)";

export async function loadFavoriteIds(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.from("favorites").select("product_id").eq("user_id", userId);
  if (error) {
    console.error("[favorites] load error:", error.message);
    return [];
  }
  return (data ?? []).map((f) => f.product_id).filter((id): id is number => id != null);
}

export async function addFavorite(supabase: SupabaseClient<Database>, userId: string, productId: number) {
  const { error } = await supabase.from("favorites").insert({ user_id: userId, product_id: productId });
  if (error) console.error("[favorites] add error:", error.message);
}

export async function removeFavorite(supabase: SupabaseClient<Database>, userId: string, productId: number) {
  const { error } = await supabase.from("favorites").delete().eq("user_id", userId).eq("product_id", productId);
  if (error) console.error("[favorites] remove error:", error.message);
}

export async function getFavoriteProducts(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase
    .from("favorites")
    .select(`product_id, products(${FAVORITE_PRODUCT_COLUMNS})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[favorites] products load error:", error.message);
    return [];
  }
  return withBrandName(
    (data ?? []).map((f) => f.products as ProductListRow | null).filter(Boolean) as ProductListRow[],
  );
}
