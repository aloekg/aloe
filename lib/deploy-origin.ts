import { SITE_URL } from "@/lib/constants";

// Unset or malformed falls back to SITE_URL on purpose: failing the other way would noindex production.
export function resolveDeployOrigin(raw: string | null | undefined, siteUrl: string = SITE_URL): string {
  const value = raw?.trim();
  if (!value) return siteUrl;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : siteUrl;
  } catch {
    return siteUrl;
  }
}

export const DEPLOY_ORIGIN = resolveDeployOrigin(process.env.DEPLOY_ORIGIN);

export const IS_CANONICAL_HOST = DEPLOY_ORIGIN === SITE_URL;
