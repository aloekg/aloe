import type { SupabaseClient } from "@supabase/supabase-js";
import { soft } from "@/lib/db";
import { adminRole, type AdminRole } from "@/lib/roles";
import type { Database } from "@/types/database";

export type AdminUserRow = {
  id: string;
  email: string;
  /** From `profiles` — an account that never saved one has none. */
  name: string | null;
  phone: string | null;
  role: AdminRole | null;
  createdAt: string;
  lastSignInAt: string | null;
};

/** GoTrue's admin list is paginated; this is comfortably inside its per-page cap. */
const PAGE_SIZE = 200;
/**
 * A stop for a runaway loop rather than a real limit: 2000 accounts is far past anything this
 * shop has, and the page says so instead of silently showing a prefix of the list.
 */
const MAX_PAGES = 10;

/**
 * Accounts live in `auth.users`, which PostgREST does not expose — only the Auth admin API reads
 * them, so this takes the service-role client from `requireAdmin()` and cannot be called with a
 * user-scoped one. Emails come from there; names and phones only exist in `profiles`.
 */
export async function listUsers(db: SupabaseClient<Database>): Promise<{ users: AdminUserRow[]; truncated: boolean }> {
  const accounts = [];
  let truncated = false;

  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(`[users] ${error.message}`);
    accounts.push(...data.users);
    if (data.users.length < PAGE_SIZE) break;
    if (page >= MAX_PAGES) {
      truncated = true;
      break;
    }
  }

  const profiles = soft("user-profiles", await db.from("profiles").select("id, name, phone"), []);
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const users = accounts.map((account) => ({
    id: account.id,
    email: account.email ?? "",
    name: byId.get(account.id)?.name ?? null,
    phone: byId.get(account.id)?.phone ?? null,
    role: adminRole(account),
    createdAt: account.created_at,
    lastSignInAt: account.last_sign_in_at ?? null,
  }));

  // Whoever has access comes first — the list exists to answer that question, and the answer
  // should not need scrolling. Newest accounts next, which is where a just-registered colleague
  // will be.
  const rank = (role: AdminRole | null) => (role === "superadmin" ? 0 : role === "admin" ? 1 : 2);
  users.sort((a, b) => rank(a.role) - rank(b.role) || b.createdAt.localeCompare(a.createdAt));

  return { users, truncated };
}
