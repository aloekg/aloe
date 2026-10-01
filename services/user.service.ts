import type { SupabaseClient } from "@supabase/supabase-js";
import { soft } from "@/lib/db";
import { adminRole, type AdminRole } from "@/lib/roles";
import type { Database } from "@/types/database";

export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: AdminRole | null;
  createdAt: string;
  lastSignInAt: string | null;
};

const PAGE_SIZE = 200;
const MAX_PAGES = 10;

// Fetched by id, not the whole table (capped at 1000 rows). Ids go in the URL: 150 keeps it under 8 KB.
const PROFILE_CHUNK = 150;

async function loadProfiles(db: SupabaseClient<Database>, ids: string[]) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += PROFILE_CHUNK) chunks.push(ids.slice(i, i + PROFILE_CHUNK));
  const pages = await Promise.all(
    chunks.map(async (chunk) =>
      soft("user-profiles", await db.from("profiles").select("id, name, phone").in("id", chunk), []),
    ),
  );
  return pages.flat();
}

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

  const profiles = await loadProfiles(
    db,
    accounts.map((a) => a.id),
  );
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

  const rank = (role: AdminRole | null) => (role === "superadmin" ? 0 : role === "admin" ? 1 : 2);
  users.sort((a, b) => rank(a.role) - rank(b.role) || b.createdAt.localeCompare(a.createdAt));

  return { users, truncated };
}
