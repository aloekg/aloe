import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveOrigin, safeRedirect } from "@/lib/safe-redirect";

const BASE = "https://aloe.kg";

describe("safeRedirect", () => {
  // These two were live open redirects: bare concatenation onto the origin made
  // `@evil.com` resolve to evil.com and `.evil.com` to aloe.kg.evil.com.
  it.each([
    ["@evil.com"],
    [".evil.com"],
    ["//evil.com"],
    ["/\\evil.com"],
    ["https://evil.com"],
    ["javascript:alert(1)"],
    ["\\\\evil.com"],
    [""],
    [null],
    [undefined],
  ])("keeps %j on our own host", (next) => {
    expect(safeRedirect(next, BASE).host).toBe("aloe.kg");
  });

  it("allows relative paths through, query string intact", () => {
    expect(safeRedirect("/profile", BASE).href).toBe("https://aloe.kg/profile");
    expect(safeRedirect("/catalog/kosmetika?sub=krem", BASE).href).toBe("https://aloe.kg/catalog/kosmetika?sub=krem");
  });

  it("falls back to the given path when next is unusable", () => {
    expect(safeRedirect("@evil.com", BASE).pathname).toBe("/auth");
    expect(safeRedirect(null, BASE, "/").pathname).toBe("/");
  });
});

describe("resolveOrigin", () => {
  it("uses the request origin when no forwarded host is present", () => {
    expect(resolveOrigin(null, "https://localhost:3000")).toBe("https://localhost:3000");
  });

  it("honours our own host and its subdomains", () => {
    expect(resolveOrigin("aloe.kg", "https://x")).toBe("https://aloe.kg");
    expect(resolveOrigin("www.aloe.kg", "https://x")).toBe("https://www.aloe.kg");
  });

  it("honours the deployment host only when the platform declares it", () => {
    expect(resolveOrigin("aloe-next.vercel.app", "https://x")).toBe("https://aloe.kg");

    vi.stubEnv("VERCEL_URL", "aloe-next.vercel.app");
    expect(resolveOrigin("aloe-next.vercel.app", "https://x")).toBe("https://aloe-next.vercel.app");
    vi.unstubAllEnvs();
  });

  it("rejects an attacker-supplied host", () => {
    expect(resolveOrigin("evil.com", "https://x")).toBe("https://aloe.kg");
    expect(resolveOrigin("aloe.kg.evil.com", "https://x")).toBe("https://aloe.kg");
    // A blanket *.vercel.app allowance used to let any attacker-owned deployment through.
    expect(resolveOrigin("attacker.vercel.app", "https://x")).toBe("https://aloe.kg");
    // Only the first entry of a comma-joined header is considered.
    expect(resolveOrigin("evil.com, aloe.kg", "https://x")).toBe("https://aloe.kg");
  });
});

describe("resolveOrigin in development", () => {
  // Next sets x-forwarded-host from the Host header even with nothing proxying, so a dev server
  // used to fail every allow-list check and fall back to SITE_URL — sending anyone who opened a
  // confirmation or password-reset link locally to the live shop instead.
  afterEach(() => vi.unstubAllEnvs());

  it("honours localhost only outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveOrigin("localhost:3000", "http://localhost:3000")).toBe("http://localhost:3000");
    expect(resolveOrigin("127.0.0.1:3000", "http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");

    vi.stubEnv("NODE_ENV", "production");
    expect(resolveOrigin("localhost:3000", "http://localhost:3000")).toBe("https://aloe.kg");
  });

  it("still refuses a lookalike host that merely contains localhost", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveOrigin("localhost.evil.com", "http://localhost:3000")).toBe("https://aloe.kg");
    expect(resolveOrigin("evil.com", "http://localhost:3000")).toBe("https://aloe.kg");
  });
});
