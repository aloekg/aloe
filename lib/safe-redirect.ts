import { SITE_URL } from "@/lib/constants";

// Also the client-side guard: /auth hands ?next= straight to router.push. Rejects "//host" and "/\host".
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (typeof next !== "string" || !/^\/(?![/\\])/.test(next)) return fallback;

  // URL parsing strips tab/CR/LF first, so "/\t/evil.com" passes the regex above; reject controls anywhere.
  if (/[\u0000-\u0020\u007f\\]/.test(next)) return fallback;

  // Looks redundant, but is the final open-redirect guard: must resolve to the sentinel origin.
  try {
    if (new URL(next, "https://probe.invalid").origin !== "https://probe.invalid") return fallback;
  } catch {
    return fallback;
  }

  return next;
}

export function safeRedirect(next: string | null | undefined, base: string, fallback = "/auth?confirmed=true"): URL {
  if (next && safeNextPath(next, "") !== "") {
    try {
      const url = new URL(next, base);
      if (url.origin === new URL(base).origin) return url;
    } catch {
      // fall through to the default below
    }
  }
  return new URL(fallback, base);
}

function deployHost(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

export function resolveOrigin(forwardedHost: string | null | undefined, requestOrigin: string): string {
  if (!forwardedHost) return requestOrigin;

  const canonical = new URL(SITE_URL).host;
  const host = forwardedHost.split(",")[0].trim();

  // x-forwarded-host is client-controllable: explicit hosts only, no *.vercel.app or *.aloe.kg wildcards.
  const allowed = [
    canonical,
    `www.${canonical}`,
    deployHost(process.env.DEPLOY_ORIGIN),
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ].filter(Boolean);
  if (allowed.includes(host)) return `https://${host}`;

  // Dev only: Next sets x-forwarded-host from Host, so without this localhost links redirect to SITE_URL.
  if (process.env.NODE_ENV !== "production" && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
    return requestOrigin;
  }

  return SITE_URL;
}
