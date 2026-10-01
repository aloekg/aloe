// Keep free of imports: next.config.ts loads this file, possibly without the @/* alias.

// Hardcoded on purpose: staging reads product photos from production's buckets.
const PRODUCTION_SUPABASE_ORIGIN = "https://ukgtmxzpzprmoutqskgq.supabase.co";

const VERCEL_TOOLBAR = {
  script: ["https://vercel.live"],
  style: ["https://vercel.live"],
  font: ["https://vercel.live", "https://assets.vercel.com"],
  img: ["https://vercel.live", "https://vercel.com"],
  connect: ["https://vercel.live", "wss://ws-us3.pusher.com"],
  frame: ["https://vercel.live"],
} as const;

export type CspEnv = {
  supabaseUrl: string | undefined;
  isDev: boolean;
  isPreview: boolean;
};

// Origin only: a stray path makes the directive invalid, and browsers then drop the whole policy.
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

  // Throws outside dev on purpose, unlike DEPLOY_ORIGIN's silent fallback.
  if (!api) {
    const message = "NEXT_PUBLIC_SUPABASE_URL is missing or not a URL, so the CSP would block every Supabase request.";
    if (!isDev) throw new Error(`[csp] ${message}`);
    console.warn(`[csp] ${message} Falling back to 'self' only.`);
  }

  const imageOrigins = [...new Set([api, PRODUCTION_SUPABASE_ORIGIN].filter((o): o is string => Boolean(o)))];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "frame-src": ["'none'"],
    "form-action": ["'self'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'"],
    // No nonce: prerendered pages embed inline RSC scripts a per-request nonce cannot match.
    "script-src": ["'self'", "'unsafe-inline'"],
    // Unavoidable: nextjs-toploader injects a <style>, and style props are attributes nonces do not cover.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...imageOrigins],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(api ? [api] : [])],
  };

  if (isDev) {
    // Vercel analytics load from va.vercel-scripts.com only in dev; production uses same-origin /_vercel.
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
