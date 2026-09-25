import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import { IS_CANONICAL_HOST } from "@/lib/deploy-origin";

export default function robots(): MetadataRoute.Robots {
  // A non-canonical host (preview, stale DEPLOY_ORIGIN) must stay out of the index entirely, sitemap included.
  if (!IS_CANONICAL_HOST) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Crawl-budget guard for faceted URLs; deliberately not paired with noindex, which a blocked page never serves.
      disallow: [
        "/admin",
        "/cart",
        "/checkout",
        "/profile",
        "/favorites",
        "/auth",
        "/review",
        "/order",
        "/search",
        "/*?q=",
        "/*?brand=",
        "/*?sort=",
        "/*?price_min=",
        "/*?price_max=",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
