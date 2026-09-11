import type { SupabaseClient } from "@supabase/supabase-js";
import { strict } from "@/lib/db";
import type { Database } from "@/types/database";

type CartItem = {
  id: number;
  name: string;
  price: number;
  image_url: string;
  quantity: number;
};

type CartRow = {
  product_id: number;
  quantity: number;
  products: { name: string; price: number; image_url: string; thumbnail_url: string | null } | null;
};

/** Throws on failure — an empty cart and an unreachable database must not merge the same way. */
export async function loadCart(supabase: SupabaseClient<Database>, userId: string): Promise<CartItem[]> {
  const res = await supabase
    .from("cart_items")
    .select("product_id, quantity, products(name, price, image_url, thumbnail_url)")
    .eq("user_id", userId);

  return (strict("cart/load", res) as unknown as CartRow[])
    .filter((r) => r.products !== null)
    .map((r) => ({
      id: r.product_id,
      name: r.products!.name,
      price: r.products!.price,
      // Cart rows are ~64px — match what ProductCard puts in the local cart.
      image_url: r.products!.thumbnail_url || r.products!.image_url,
      quantity: r.quantity,
    }));
}

export async function upsertCartItem(
  supabase: SupabaseClient<Database>,
  userId: string,
  productId: number,
  quantity: number,
) {
  const { error } = await supabase
    .from("cart_items")
    .upsert({ user_id: userId, product_id: productId, quantity }, { onConflict: "user_id,product_id" });
  if (error) console.error("[cart] upsert error:", error.message);
}

export async function deleteCartItem(supabase: SupabaseClient<Database>, userId: string, productId: number) {
  const { error } = await supabase.from("cart_items").delete().eq("user_id", userId).eq("product_id", productId);
  if (error) console.error("[cart] delete error:", error.message);
}

export async function clearCart(supabase: SupabaseClient<Database>, userId: string) {
  const { error } = await supabase.from("cart_items").delete().eq("user_id", userId);
  if (error) console.error("[cart] clear error:", error.message);
}

export async function reconcileCartItems(
  supabase: SupabaseClient<Database>,
  userId: string,
  items: { id: number; quantity: number }[],
) {
  const { error } = await supabase.from("cart_items").upsert(
    items.map((i) => ({ user_id: userId, product_id: i.id, quantity: i.quantity })),
    { onConflict: "user_id,product_id" },
  );
  if (error) console.error("[cart] reconcile error:", error.message);
}
