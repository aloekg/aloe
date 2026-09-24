import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "@/lib/csp";

const csp = buildContentSecurityPolicy({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  isDev: process.env.NODE_ENV === "development",
  isPreview: process.env.VERCEL_ENV === "preview",
});

// Enforcing. It shipped as Report-Only on 2026-09-16 and was flipped once the policy had been
// checked against what the site actually loads.
//
// The one behaviour change to know about: `img-src` no longer allows arbitrary third-party hosts,
// and nine products carry markdown images hotlinked from manufacturers' sites, inherited from the
// old JoomShopping descriptions. Half of those URLs are already dead — they render as broken
// images today — and the rest leak a referrer to eight external hosts on every product view. The
// fix is to clean up those descriptions, not to widen the policy; widening it would bless
// hotlinking to anywhere, permanently, for nine rows.
//
// Deliberately no report-uri/report-to: that would be an unauthenticated public POST endpoint,
// and extensions generate a steady stream of junk violations against the same function budget
// CODEBASE.md → "Cache budget" is about. Read violations from the DevTools console instead.
const CSP_HEADER = "Content-Security-Policy";

const nextConfig: NextConfig = {
  images: {
    // formats: ["image/webp"],
    // minimumCacheTTL: 2678400,
    // qualities: [75],
    // remotePatterns: [
    //   { protocol: "https", hostname: "aloe.kg" },
    //   { protocol: "https", hostname: "ukgtmxzpzprmoutqskgq.supabase.co" },
    // ],
    unoptimized: true,
  },
  devIndicators: false,
  experimental: {
    serverActions: {
      // Product photos are uploaded untouched and re-encoded in `uploadProductImage`. The default
      // is 1 MB, which silently rejected anything straight off a phone before the action ran.
      bodySizeLimit: "16mb",
    },
  },
  // lib/invoice.ts resolves these at runtime via process.cwd(), which the file tracer
  // cannot follow — without this the TTFs are missing from the serverless bundle and
  // invoice generation throws in production.
  outputFileTracingIncludes: {
    "/checkout": ["./lib/fonts/**"],
    "/admin/orders": ["./lib/fonts/**"],
  },
  poweredByHeader: false,

  // Headers are matched before the filesystem and before proxy.ts, so this also covers
  // /_next/static, /public and the metadata routes — every one of which proxy.ts's matcher
  // deliberately excludes. Setting them here rather than in the proxy also keeps that file's three
  // early returns (the legacy redirects, and the anonymous-visitor fast path that is most of the
  // storefront's traffic) from each needing their own copy of the header block, and costs no
  // function invocation at all.
  //
  // Deliberately NOT set: Strict-Transport-Security. Vercel already sends max-age=63072000 on
  // aloe.kg, so ours would only duplicate it — and the tempting `includeSubDomains` would make
  // https://mail.aloe.kg permanently unopenable. That host presents a *.hoster.kg certificate
  // (see lib/mailer.ts), and HSTS turns a name mismatch into an error no browser lets you click
  // through, for max-age. With `preload` on top it would take months to undo.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: CSP_HEADER, value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Superseded by frame-ancestors above, kept for pre-CSP2 browsers. Nothing here is ever
          // framed — there is no <iframe> in the repository — and /admin's mutations are one-click
          // server actions, which is exactly what clickjacking targets.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // None of these APIs are used. The admin photo upload is <input type="file"> (an OS
          // picker), not getUserMedia, so camera=() does not touch it.
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), midi=()",
          },
        ],
      },
      // Must come after the entry above — where two rules set the same key for the same path, the
      // last one wins.
      //
      // /auth/confirm reads `token_hash` and `code` straight out of the query string: live auth
      // secrets in a URL. strict-origin-when-cross-origin already truncates those to the bare
      // origin off-site; no-referrer additionally keeps them out of same-origin Referer headers and
      // out of document.referrer. Nothing under /auth depends on a referrer.
      {
        source: "/auth/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      // Same reasoning, different secret: /review/<token> carries the proof that someone received a
      // particular order. A leaked token lets a stranger read that order's contents and write
      // reviews in the buyer's stead, so it must not ride along in a Referer header — and the page
      // links out to /auth and /profile, which would otherwise carry it.
      {
        source: "/review/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      // Same secret, other door: /order/<token> claims the order for whoever signs in there.
      {
        source: "/order/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      // And where that token is first shown: checkout lands a guest on /checkout/success?t=<token>
      // so the page can offer the account that will own the order. Same secret, same header.
      {
        source: "/checkout/success",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
