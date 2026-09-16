import { SITE_URL } from "@/lib/constants";

/**
 * Only same-origin relative paths may be redirected to. Bare concatenation onto an origin lets
 * `next=@evil.com` resolve to a foreign host and `next=.evil.com` to a lookalike subdomain.
 */
export function safeRedirect(next: string | null | undefined, base: string, fallback = "/auth?confirmed=true"): URL {
  if (next && /^\/(?![/\\])/.test(next)) {
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
