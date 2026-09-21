import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, supabaseOrigin } from "@/lib/csp";

const PROD = "https://ukgtmxzpzprmoutqskgq.supabase.co";
const STAGE = "https://puqmkruyhjfvhyjfriig.supabase.co";

/** Split the rendered header back into directives so a test can assert on one without substring games. */
function directives(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split("; ").map((part) => {
      const [name, ...values] = part.split(" ");
      return [name, values];
    }),
  );
}

const production = { supabaseUrl: PROD, isDev: false, isPreview: false };
const staging = { supabaseUrl: STAGE, isDev: false, isPreview: true };
const development = { supabaseUrl: STAGE, isDev: true, isPreview: false };

describe("supabaseOrigin", () => {
  it("keeps only the origin, so a stray path cannot invalidate the directive", () => {
    expect(supabaseOrigin(`${PROD}/`)).toBe(PROD);
    expect(supabaseOrigin(`${PROD}/rest/v1?x=1`)).toBe(PROD);
  });

  it("trims whitespace a copy-pasted env value tends to carry", () => {
    expect(supabaseOrigin(`  ${PROD}  `)).toBe(PROD);
  });

  it.each([undefined, null, "", "   ", "ukgtmxzpzprmoutqskgq.supabase.co", "javascript:alert(1)", "not a url"])(
    "rejects %p rather than emitting a broken directive",
    (value) => {
      expect(supabaseOrigin(value)).toBeNull();
    },
  );
});

describe("buildContentSecurityPolicy", () => {
  it("locks down the framing, base and object vectors on every environment", () => {
    for (const env of [production, staging, development]) {
      const d = directives(buildContentSecurityPolicy(env));
      expect(d["frame-ancestors"]).toEqual(["'none'"]);
      expect(d["object-src"]).toEqual(["'none'"]);
      expect(d["base-uri"]).toEqual(["'self'"]);
      expect(d["form-action"]).toEqual(["'self'"]);
    }
  });

  it("allows the deployment's own Supabase project to be called and read from", () => {
    const d = directives(buildContentSecurityPolicy(production));
    expect(d["connect-src"]).toContain(PROD);
    expect(d["img-src"]).toContain(PROD);
    expect(d["font-src"]).toEqual(["'self'"]); // next/font/google self-hosts; no fonts.gstatic.com
  });

  it("names production's storage origin once on production, not twice", () => {
    const d = directives(buildContentSecurityPolicy(production));
    expect(d["img-src"].filter((o) => o === PROD)).toHaveLength(1);
  });

  // Staging reads product photos out of production's public buckets (scripts/seed-staging.mjs), and
  // the four /catalog tiles live only there (SPECIALS_BASE_URL). But its browser must never be
  // allowed to talk to production's API.
  it("lets staging load production's images while calling only its own API", () => {
    const d = directives(buildContentSecurityPolicy(staging));
    expect(d["img-src"]).toEqual(expect.arrayContaining([STAGE, PROD]));
    expect(d["connect-src"]).toContain(STAGE);
    expect(d["connect-src"]).not.toContain(PROD);
  });

  it("carries the Vercel Toolbar origins on a preview deployment and nowhere else", () => {
    expect(directives(buildContentSecurityPolicy(staging))["frame-src"]).toEqual(["https://vercel.live"]);

    const prod = directives(buildContentSecurityPolicy(production));
    expect(prod["frame-src"]).toEqual(["'none'"]);
    expect(prod["script-src"]).not.toContain("https://vercel.live");
  });

  it("keeps the development-only relaxations out of a production build", () => {
    const prod = directives(buildContentSecurityPolicy(production));
    expect(prod["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(prod["script-src"]).not.toContain("'unsafe-eval'");
    expect(prod["connect-src"]).not.toContain("ws:");
    expect(buildContentSecurityPolicy(production)).toContain("upgrade-insecure-requests");
  });

  it("grants eval and the HMR socket in development, and stops upgrading localhost to https", () => {
    const dev = directives(buildContentSecurityPolicy(development));
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(dev["connect-src"]).toContain("ws:");
    expect(buildContentSecurityPolicy(development)).not.toContain("upgrade-insecure-requests");
  });

  // The failure direction is the opposite of DEPLOY_ORIGIN's: a missing variable here would ship a
  // policy that blocks the API the whole shop runs on, so the build must stop instead.
  it("refuses to build a production policy without NEXT_PUBLIC_SUPABASE_URL", () => {
    expect(() => buildContentSecurityPolicy({ supabaseUrl: undefined, isDev: false, isPreview: false })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
    expect(() => buildContentSecurityPolicy({ supabaseUrl: "not a url", isDev: false, isPreview: false })).toThrow();
  });

  it("falls back to 'self' in development rather than stopping the dev server", () => {
    const d = directives(buildContentSecurityPolicy({ supabaseUrl: undefined, isDev: true, isPreview: false }));
    expect(d["connect-src"]).toContain("'self'");
    expect(d["img-src"]).toContain(PROD);
  });
});
