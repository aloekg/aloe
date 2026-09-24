import { SITE_URL } from "@/lib/constants";

/**
 * A relative, same-origin path: one leading slash and not a second, which is what separates
 * `/review/abc` from the protocol-relative `//evil.com` a browser reads as another host. A
 * backslash is excluded too — browsers normalise `/\evil.com` the same way.
 *
 * Shared by the server redirect below and by the client, where there is no origin to resolve
 * against: `/auth` hands whatever `?next=` says to `router.push`, so an unchecked value is an open
 * redirect with the shop's own sign-in page as the bait.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (typeof next !== "string" || !/^\/(?![/\\])/.test(next)) return fallback;

  // The WHATWG parser strips tab, CR and LF *before* it reads the string, so `/\t/evil.com` passes
  // the check above and still resolves to https://evil.com/ — which is exactly what
  // `router.push` then hands to `location.assign`. Refuse every C0 control, the space and a
  // backslash anywhere, not only in second position; a real path arrives percent-encoded.
  if (/[\u0000-\u0020\u007f\\]/.test(next)) return fallback;

  // Belt and braces: resolve against a sentinel origin and make sure it stayed there.
  try {
    if (new URL(next, "https://probe.invalid").origin !== "https://probe.invalid") return fallback;
  } catch {
    return fallback;
  }

  return next;
}

/**
 * Only same-origin relative paths may be redirected to. Bare concatenation onto an origin lets
 * `next=@evil.com` resolve to a foreign host and `next=.evil.com` to a lookalike subdomain.
 */
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

/**
 * `x-forwarded-host` is client-controllable unless every proxy in front of us strips it, so only
 * hosts we actually deploy to are honoured.
 */
export function resolveOrigin(forwardedHost: string | null | undefined, requestOrigin: string): string {
  if (!forwardedHost) return requestOrigin;

  const allowed = new URL(SITE_URL).host;
  const host = forwardedHost.split(",")[0].trim();

  // Explicit hosts only. A blanket `*.vercel.app` allowance let the redirect be steered to any
  // attacker-owned Vercel deployment, which undercut the point of validating this header at all.
  const deployments = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL].filter(Boolean);
  if (host === allowed || host.endsWith(`.${allowed}`) || deployments.includes(host)) return `https://${host}`;

  // Next sets x-forwarded-host from the Host header even when nothing is proxying, so a local
  // server sees `localhost:3000` here, fails every check above, and falls back to SITE_URL — which
  // means an email confirmation or password-reset link opened against a dev server redirects to
  // the live shop. Honouring localhost in development makes those flows testable without touching
  // production behaviour: the branch cannot be reached in a production build.
  if (process.env.NODE_ENV !== "production" && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
    return requestOrigin;
  }

  return SITE_URL;
}
