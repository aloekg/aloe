import { SITE_URL } from "@/lib/constants";

/**
 * The origin this deployment actually answers on, which is not always `SITE_URL`.
 *
 * During the cutover the new shop is served from `new.aloe.kg` while `SITE_URL` (aloe.kg) still
 * resolves to the old JoomShopping store, and canonical URLs, the sitemap and JSON-LD deliberately
 * point at the final domain. Anything that must address *this* deployment — a link in an admin
 * notification email, the decision whether this host may be indexed — needs the real origin
 * instead, so it is configured rather than hardcoded:
 *
 *   DEPLOY_ORIGIN=https://new.aloe.kg    # set in Vercel until aloe.kg points here
 *
 * Unset (and after the cutover, when the two are the same) it falls back to `SITE_URL`. That
 * direction of failure is the safe one: a missing variable then leaves the production shop
 * indexable, whereas defaulting to "not canonical" would quietly noindex the real site.
 *
 * See MIGRATION.md for the cutover checklist.
 */
export function resolveDeployOrigin(raw: string | null | undefined, siteUrl: string = SITE_URL): string {
  const value = raw?.trim();
  if (!value) return siteUrl;

  try {
    const url = new URL(value);
    // Only http(s), and only the origin: a stray path or query would corrupt every URL built on it.
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : siteUrl;
  } catch {
    return siteUrl;
  }
}

export const DEPLOY_ORIGIN = resolveDeployOrigin(process.env.DEPLOY_ORIGIN);

/** True when this deployment serves the canonical domain — i.e. it may be indexed. */
export const IS_CANONICAL_HOST = DEPLOY_ORIGIN === SITE_URL;
