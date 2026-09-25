// setUserRole never grants superadmin; it is set by hand in Supabase (see CODEBASE.md, Auth).
export type AdminRole = "admin" | "superadmin";

// An index signature, not { role?: unknown }: TypeScript's weak-type check rejects the latter.
type WithMetadata = { app_metadata?: { [key: string]: unknown } } | null | undefined;

export function adminRole(user: WithMetadata): AdminRole | null {
  const role = user?.app_metadata?.role;
  return role === "admin" || role === "superadmin" ? role : null;
}

export function isSuperAdmin(user: WithMetadata): boolean {
  return adminRole(user) === "superadmin";
}
