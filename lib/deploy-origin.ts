import { SITE_URL } from "@/lib/constants";

/**
 * The origin this deployment actually answers on, which is not always `SITE_URL`.
 *
 * Canonical URLs, the sitemap and JSON-LD all address `SITE_URL`. Anything that must address
 * *this* deployment instead — a link in an admin notification email, the decision whether this
 * host may be indexed — needs the real origin, so it is configured rather than hardcoded:
 *
 *   DEPLOY_ORIGIN=https://preview.example    # only where this build is NOT on aloe.kg
 *
 * It exists because the two were different during the cutover: the shop ran on `new.aloe.kg`
 * while aloe.kg still resolved to the old JoomShopping store. That is over — aloe.kg serves this
 * deployment — so **production must leave the variable unset**: a leftover value there noindexes
 * the live shop, which is exactly what it did for a while after the cutover. What remains is
 * preview deployments, which should not be indexed either.
 *
 * Unset or malformed, it falls back to `SITE_URL`. That direction of failure is the safe one: a
 * missing variable leaves the production shop indexable, whereas defaulting to "not canonical"
 * would quietly noindex the real site.
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
