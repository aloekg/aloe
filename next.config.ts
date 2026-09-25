import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "@/lib/csp";
import { LEGACY_FALLBACK, LEGACY_PERMANENT } from "@/lib/legacy-redirects";

const csp = buildContentSecurityPolicy({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  isDev: process.env.NODE_ENV === "development",
  isPreview: process.env.VERCEL_ENV === "preview",
});

// Deliberately no report-uri/report-to: it would be an unauthenticated public POST endpoint.
const CSP_HEADER = "Content-Security-Policy";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  devIndicators: false,
  experimental: {
    serverActions: {
      // Phone originals are re-encoded in uploadProductImage; the 1 MB default rejects them.
      bodySizeLimit: "16mb",
    },
  },
  // lib/invoice.ts loads fonts via process.cwd(), which the file tracer cannot follow.
  outputFileTracingIncludes: {
    "/checkout": ["./lib/fonts/**"],
    "/admin/orders": ["./lib/fonts/**"],
  },
  poweredByHeader: false,

  // statusCode, not permanent: Next's permanent flag emits 308/307 instead of 301/302.
  async redirects() {
    return [
      { source: "/catalog", has: [{ type: "query", key: "q" }], destination: "/search", permanent: false },
      ...Object.entries(LEGACY_PERMANENT).map(([source, destination]) => ({ source, destination, statusCode: 301 })),
      ...Object.entries(LEGACY_FALLBACK).map(([source, destination]) => ({ source, destination, statusCode: 302 })),
    ];
  },

  // Do not add Strict-Transport-Security: includeSubDomains would lock out mail.aloe.kg (*.hoster.kg cert).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: CSP_HEADER, value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), midi=()",
          },
        ],
      },
      // Must follow the entry above (last rule wins). These URLs carry auth or order-access tokens.
      {
        source: "/auth/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/review/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/order/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/checkout/success",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
