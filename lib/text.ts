/**
 * Bounds on the free-text customer fields, shared by every action that writes them.
 *
 * A server action's arguments are attacker-controlled in exactly the way a route handler's body
 * is: the type annotation is erased at runtime, so `name: string` is a claim, not a check. Both
 * the checkout and the profile form write the same three fields to the database, and only one of
 * them used to bound them — hence one module rather than a constant per call site.
 */
export const CONTACT_LIMITS = { name: 120, phone: 32, address: 500 } as const;

/**
 * Trim and cap, treating anything that is not a string as absent rather than coercing it — so a
 * crafted payload sending an object or an array cannot reach the database as "[object Object]",
 * and cannot reach it at all if the field is required.
 */
export function normalizeText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
