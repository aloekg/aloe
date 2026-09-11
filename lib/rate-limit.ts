import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Fixed-window rate limiting for public server actions, backed by the `rate_limit_hit` Postgres
 * function (see supabase/migrations/20260911120300_rate_limits.sql). Postgres rather than Redis because there is no
 * other store here and the volume is tiny.
 *
 * Fails **open**: if the limiter itself errors we let the request through rather than blocking a
 * real customer from ordering. Abuse protection is not worth losing a sale to a hiccup in the
 * counter, and the failure is logged.
 */
export async function rateLimit(
  bucket: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): Promise<{ allowed: boolean }> {
  const key = await clientKey();

  try {
    const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
      p_bucket: bucket,
      p_key: key,
      p_limit: limit,
      p_window: `${windowSeconds} seconds`,
    });

    if (error) {
      console.error(`[rate-limit] ${bucket} check failed, allowing through: ${error.message}`);
      return { allowed: true };
    }
    if (data === false) console.warn(`[rate-limit] ${bucket} exceeded for ${key}`);
    return { allowed: data !== false };
  } catch (err) {
    console.error(`[rate-limit] ${bucket} check threw, allowing through`, err);
    return { allowed: true };
  }
}

/**
 * Client IP from the proxy headers. `x-forwarded-for` is client-settable in general, but on Vercel
 * the platform overwrites it, and the leftmost entry is the real client. Falls back to a shared
 * bucket so a missing header throttles collectively rather than not at all.
 */
async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
  return ip || "unknown";
}
