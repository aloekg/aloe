/**
 * The Content-Security-Policy this deployment serves, assembled at BUILD time by next.config.ts.
 *
 * It is built here rather than written out as a literal because one origin differs per
 * environment: the browser talks to whichever Supabase project NEXT_PUBLIC_SUPABASE_URL names, and
 * production and staging are two separate projects. Hardcoding it would leave staging with every
 * query, every login, the search autocomplete and the cart sync blocked.
 *
 * **Why no nonce**, given the Next guide leads with one: a nonce is read off the request at render
 * time, so every page carrying one has to be dynamic. This build prerenders the storefront, and
 * each prerendered HTML file embeds Next's RSC payload as inline `<script>` tags — a nonce minted
 * per request cannot match a script that was serialized at build time. Forcing all of it dynamic
 * to fix that would trade CDN-served HTML for a serverless render on every view of a 2400-product
 * catalogue, which is the opposite of what CODEBASE.md → "Cache budget" is about. `'unsafe-inline'`
 * is the variant the Next guide itself offers for exactly this case; `'self'` still blocks the
 * injection of an *external* script, and the only place this app interpolates data into an inline
 * script — components/JsonLd.tsx — escapes `<`, `>` and `&` before it does.
 *
 * Kept free of imports on purpose: next.config.ts is transpiled through a require hook that honours
 * the `@/*` path alias today, but Next also has an opt-in loader that strips types with plain Node
 * and no alias resolution. With no imports here, that path costs one specifier change, not a
 * rewrite.
 */

/**
 * Production's storage origin, hardcoded for the same reason SPECIALS_BASE_URL is in
 * lib/constants.ts: staging runs its own database but reads product photos out of *these* buckets,
 * because the catalogue seed copies rows and never objects (scripts/seed-staging.mjs). So staging
 * must allow two image origins — its own, for anything uploaded through its admin, and this one.
 *
 * With staging's project deleted (2026-09-21) this is currently the same string the environment
 * yields, and the dedupe below keeps the header from saying it twice. It stays written down because
 * the next staging needs it again the day it is seeded.
 *
 * Deliberately *not* listing the old Mumbai origin after the region move: no row names it any more
 * (supabase/sql/rewrite-storage-urls.sql verifies that and rolls back if one does), and an origin
 * nothing needs is an origin the policy should not allow.
 */
const PRODUCTION_SUPABASE_ORIGIN = "https://ukgtmxzpzprmoutqskgq.supabase.co";

/**
 * The Vercel Toolbar, injected into preview deployments only — stage.aloe.kg is one, which is why
 * it sits behind Vercel Authentication. Gated so production never carries these, and so staging is
 * not buried under violations from Vercel's own UI.
 */
const VERCEL_TOOLBAR = {
  script: ["https://vercel.live"],
  style: ["https://vercel.live"],
  font: ["https://vercel.live", "https://assets.vercel.com"],
  img: ["https://vercel.live", "https://vercel.com"],
  connect: ["https://vercel.live", "wss://ws-us3.pusher.com"],
  frame: ["https://vercel.live"],
} as const;

export type CspEnv = {
  /** NEXT_PUBLIC_SUPABASE_URL for this deployment. */
  supabaseUrl: string | undefined;
  isDev: boolean;
  /** process.env.VERCEL_ENV === "preview" */
  isPreview: boolean;
};

/**
 * Origin only. A stray path or trailing slash in the env value would make the directive invalid,
 * and an invalid directive is not a partial policy — browsers drop the whole thing.
 */
export function supabaseOrigin(raw: string | undefined | null): string | null {
  const value = raw?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy({ supabaseUrl, isDev, isPreview }: CspEnv): string {
  const api = supabaseOrigin(supabaseUrl);

  // Unlike DEPLOY_ORIGIN, the safe direction here is to fail loudly: a missing variable would ship
  // a policy that blocks the API the whole shop runs on. A production build should stop; dev can
  // limp along, since `next dev` reads .env.local anyway and the warning is right there.
  if (!api) {
    const message = "NEXT_PUBLIC_SUPABASE_URL is missing or not a URL, so the CSP would block every Supabase request.";
    if (!isDev) throw new Error(`[csp] ${message}`);
    console.warn(`[csp] ${message} Falling back to 'self' only.`);
  }

  // On production these two are the same string; dedupe so the header does not repeat it.
  const imageOrigins = [...new Set([api, PRODUCTION_SUPABASE_ORIGIN].filter((o): o is string => Boolean(o)))];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"], // blocks the <base> injection that silently repoints every relative src
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"], // clickjacking on /admin's one-click server actions
    "frame-src": ["'none'"],
    "form-action": ["'self'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'"],
    // See the file header for why this is 'unsafe-inline' rather than a nonce.
    "script-src": ["'self'", "'unsafe-inline'"],
    // Unavoidable in both modes, and a nonce would not help: nextjs-toploader renders a real inline
    // <style>, and React style={{…}} props become style *attributes*, which nonces do not cover.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...imageOrigins],
    "font-src": ["'self'"], // next/font/google self-hosts into /_next/static/media at build time
    "connect-src": ["'self'", ...(api ? [api] : [])],
  };

  if (isDev) {
    // React uses eval in development to rebuild server stacks; Turbopack's HMR runs over a ws:
    // socket; @vercel/speed-insights and @vercel/analytics both load their debug script from
    // va.vercel-scripts.com in dev and from a same-origin /_vercel path in production, which is
    // also where they beacon to, so 'self' covers both of them once deployed.
    directives["script-src"].push("'unsafe-eval'", "https://va.vercel-scripts.com");
    directives["connect-src"].push("ws:", "https://va.vercel-scripts.com");
  }

  if (isPreview) {
    directives["script-src"].push(...VERCEL_TOOLBAR.script);
    directives["style-src"].push(...VERCEL_TOOLBAR.style);
    directives["font-src"].push(...VERCEL_TOOLBAR.font);
    directives["img-src"].push(...VERCEL_TOOLBAR.img);
    directives["connect-src"].push(...VERCEL_TOOLBAR.connect);
    directives["frame-src"] = [...VERCEL_TOOLBAR.frame];
  }

  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);

  // Would rewrite http://localhost:3000 to https:// in development.
  if (!isDev) policy.push("upgrade-insecure-requests");

  return policy.join("; ");
}
