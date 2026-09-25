import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { adminRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

// A route that calls this (or createClient() from lib/supabase-server) must be in proxy.ts's matcher.
export async function requireAuth() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/auth");
  return { supabase, user };
}

// notFound(), not a redirect, so the route stays hidden. Await this before any service-role query.
export async function requireAdmin() {
  const { user } = await getUser();
  const role = adminRole(user);
  if (!user || !role) notFound();
  return { user, role, db: createAdminClient() };
}

export async function requireSuperAdmin() {
  const { user, role, db } = await requireAdmin();
  if (role !== "superadmin") notFound();
  return { user, db };
}
