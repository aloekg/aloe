import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { adminRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

/** Deduped per request — the proxy, the layout and each page would otherwise each hit GoTrue. */
const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

export async function requireAuth() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/auth");
  return { supabase, user };
}

/**
 * Gate for admin pages. Returns a service-role client so admin reads don't depend on RLS
 * policies being permissive enough — which is what forced `products` to be world-readable
 * (including 748 unpublished rows) just so the admin product list would work.
 *
 * `notFound()` rather than a redirect, matching app/admin/layout.tsx: an unauthorized visitor
 * shouldn't learn the route exists. Always await this before issuing any query.
 */
export async function requireAdmin() {
  const { user } = await getUser();
  const role = adminRole(user);
  if (!user || !role) notFound();
  return { user, role, db: createAdminClient() };
}

/**
 * For the one page that decides who else gets in. `notFound()` again rather than a "forbidden"
 * screen: an ordinary admin has no business knowing the route is there.
 */
export async function requireSuperAdmin() {
  const { user, role, db } = await requireAdmin();
  if (role !== "superadmin") notFound();
  return { user, db };
}
