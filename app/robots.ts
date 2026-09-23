import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import { IS_CANONICAL_HOST } from "@/lib/deploy-origin";

export default function robots(): MetadataRoute.Robots {
  // A host that is not the canonical domain — a Vercel preview, or production with a stale
  // DEPLOY_ORIGIN — must stay out of the index entirely. Its pages are byte-identical to aloe.kg,
  // so anything indexed here becomes a duplicate that has to be redirected away later. No sitemap
  // either: it lists SITE_URL addresses, which this host does not serve.
  if (!IS_CANONICAL_HOST) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /search is already noindex via generateMetadata (and /catalog?q= now redirects to it), but
      // crawlers still burn budget on the unbounded ?q= / ?brand= / ?page= permutations behind it.
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
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
