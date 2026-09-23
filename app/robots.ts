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
      //
      // ?sort= and ?price_* join them for the same reason. No filter control on the storefront
      // renders a link — SortSelect is a <select>, ManufacturerFilter and PriceFilter are buttons
      // and inputs — so a crawler only reaches these through Pagination, which carries whatever
      // filter was active. That makes this a budget guard, not an index guard: /catalog/[slug]
      // already canonicalises every faceted variation onto the clean URL. Deliberately not paired
      // with `noindex` on those URLs — a page blocked here is never fetched, so the directive would
      // not be read, and two half-signals are worse than one whole one.
      disallow: [
        "/admin",
        "/cart",
        "/checkout",
        "/profile",
        "/favorites",
        "/auth",
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
