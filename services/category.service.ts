import type { SupabaseClient } from "@supabase/supabase-js";
import { soft, strict } from "@/lib/db";
import type { Database } from "@/types/database";

// soft, not strict: feeds the root layout, where a throw takes down every route and fails `next build`.
export async function getCategories(supabase: SupabaseClient<Database>) {
  return soft("categories", await supabase.from("categories").select("*").order("sort_order").order("name"), []);
}

// strict: resolves slugs, so an empty list on failure would become a cached 404.
export async function getCategoriesWithSlug(supabase: SupabaseClient<Database>) {
  return strict(
    "categories-with-slug",
    await supabase.from("categories").select("id, name, parent_id, slug").order("sort_order").order("name"),
  );
}
