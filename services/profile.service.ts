import type { SupabaseClient } from "@supabase/supabase-js";
import { maybe } from "@/lib/db";
import type { Database } from "@/types/database";

export async function getProfile(supabase: SupabaseClient<Database>, userId: string) {
  return maybe(
    "profile",
    await supabase.from("profiles").select("name, phone, address").eq("id", userId).maybeSingle(),
  );
}

export async function saveProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: { name: string; phone: string; address: string },
) {
  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      name: data.name,
      phone: data.phone,
      address: data.address,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  return error;
}
