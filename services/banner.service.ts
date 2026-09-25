import type { SupabaseClient } from "@supabase/supabase-js";
import { soft } from "@/lib/db";
import type { Database } from "@/types/database";

export async function getActiveBanners(supabase: SupabaseClient<Database>, type: "desktop" | "mobile") {
  return soft(
    `banners-${type}`,
    await supabase
      .from("banners")
      .select("id, image_url, link, alt")
      .eq("active", true)
      .eq("type", type)
      .order("sort_order"),
    [],
  );
}

export async function getAllBanners(supabase: SupabaseClient<Database>, type: "desktop" | "mobile") {
  return soft(
    `all-banners-${type}`,
    await supabase.from("banners").select("*").eq("type", type).order("sort_order"),
    [],
  );
}
