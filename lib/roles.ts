/**
 * The two roles that open the admin area, both stored in `app_metadata.role` — the one place only
 * the service role can write, so nothing a user controls can grant either.
 *
 * `superadmin` is deliberately not something this app can assign: `setUserRole` only ever writes
 * `admin` (or removes the key), and it refuses to touch an account that already holds
 * `superadmin`. That role is granted by hand in Supabase — see the Auth section of CODEBASE.md
 * for the statement — so no one can be locked out of their own shop from the UI. Nothing here
 * counts them: one super-admin or several behave identically, and none can demote another.
 */
export type AdminRole = "admin" | "superadmin";

// An index signature rather than `{ role?: unknown }`: Supabase's `UserAppMetadata` declares only
// `provider`/`providers` by name, and a type whose properties are all optional and all unknown to
// the source is rejected by TypeScript's weak-type check.
type WithMetadata = { app_metadata?: { [key: string]: unknown } } | null | undefined;

export function adminRole(user: WithMetadata): AdminRole | null {
  const role = user?.app_metadata?.role;
  return role === "admin" || role === "superadmin" ? role : null;
}

export function isSuperAdmin(user: WithMetadata): boolean {
  return adminRole(user) === "superadmin";
}
