import { describe, expect, it } from "vitest";
import { resolveDeployOrigin } from "@/lib/deploy-origin";

const SITE = "https://aloe.kg";

describe("resolveDeployOrigin", () => {
  it("uses the configured origin when this deployment is not on the canonical domain", () => {
    expect(resolveDeployOrigin("https://aloe-preview.vercel.app", SITE)).toBe("https://aloe-preview.vercel.app");
  });

  it("keeps only the origin, so a stray path cannot corrupt every URL built on it", () => {
    expect(resolveDeployOrigin("https://aloe-preview.vercel.app/admin/", SITE)).toBe("https://aloe-preview.vercel.app");
    expect(resolveDeployOrigin("https://aloe-preview.vercel.app/?x=1", SITE)).toBe("https://aloe-preview.vercel.app");
  });

  it("trims surrounding whitespace, which a copy-pasted env value tends to carry", () => {
    expect(resolveDeployOrigin("  https://aloe-preview.vercel.app  ", SITE)).toBe("https://aloe-preview.vercel.app");
  });

  // The fallback direction matters: an unset or malformed variable must leave production
  // indexable, never noindex the real shop.
  it.each([
    undefined,
    null,
    "",
    "   ",
    "aloe-preview.vercel.app",
    "javascript:alert(1)",
    "//aloe-preview.vercel.app",
    "not a url",
  ])("falls back to the canonical site for %p", (value) => {
    expect(resolveDeployOrigin(value, SITE)).toBe(SITE);
  });

  it("treats a value equal to the canonical site as canonical", () => {
    expect(resolveDeployOrigin("https://aloe.kg", SITE)).toBe(SITE);
  });
});
