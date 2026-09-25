import type { SupabaseClient } from "@supabase/supabase-js";
import { maybe, soft } from "@/lib/db";
import type { Database } from "@/types/database";

export async function getBrands(supabase: SupabaseClient<Database>) {
  return soft("brands", await supabase.from("brands").select("id, name, slug").order("name"), []);
}

export async function getBrandBySlug(supabase: SupabaseClient<Database>, slug: string) {
  return maybe("brand-by-slug", await supabase.from("brands").select("id, name, slug").eq("slug", slug).maybeSingle());
}

export async function getAdminBrands(supabase: SupabaseClient<Database>) {
  return soft("admin-brands", await supabase.from("brands").select("id, name").order("name"), []);
}
