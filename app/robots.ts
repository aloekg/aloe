import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import { IS_CANONICAL_HOST } from "@/lib/deploy-origin";

export default function robots(): MetadataRoute.Robots {
  // A non-canonical host (preview, stale DEPLOY_ORIGIN) must stay out of the index entirely, sitemap included.
  if (!IS_CANONICAL_HOST) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: [
      {
        // AI training crawlers: a fifth of product-page hits, and each one can cost a page rebuild.
        // Assistants that fetch on a user's behalf (OAI-SearchBot, ChatGPT-User, PerplexityBot) are
        // not here, and neither is Applebot, which also feeds Siri and Spotlight search.
        userAgent: ["meta-externalagent", "GPTBot", "ClaudeBot", "CCBot", "Bytespider", "ShapBot"],
        disallow: "/",
      },
      {
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
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
