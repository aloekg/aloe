import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";

// Fails open on purpose: a limiter error must not block a real order.
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

// Leftmost x-forwarded-for is trusted because Vercel overwrites it; "unknown" throttles collectively.
async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
  return ip || "unknown";
}
