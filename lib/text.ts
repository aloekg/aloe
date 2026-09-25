// Server action argument types are erased at runtime: every writer of these fields must enforce the caps.
export const CONTACT_LIMITS = { name: 120, phone: 32, address: 500 } as const;

// Non-strings become "" rather than being coerced, so a crafted payload cannot store "[object Object]".
export function normalizeText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
