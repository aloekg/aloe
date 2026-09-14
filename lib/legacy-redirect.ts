import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Resolves one of the previous site's product URLs to the current one.
 *
 * JoomShopping published the same product under two shapes, and `products.product_url` recorded
 * only the shorter one:
 *
 *   /catalog/product/view/21/6865.html                    <- stored in product_url
 *   /catalog/gigiena-tovar-bishkek/product/view/21/6865.html  <- what the old sitemap submitted
 *
 * The second is the one Google actually indexed — 2415 of them — so matching `product_url` whole
 * missed every indexed link and left them on the not-found page. Both shapes share the
 * `/product/view/<category>/<product>.html` tail, which is what is matched here.
 *
 * The category segment in the middle is ignored on purpose: it is the *old* tree's slug, which the
 * category reorganisation no longer maps onto, and the numeric pair identifies the product anyway.
 */
export async function redirectLegacyProduct(path: string[]): Promise<NextResponse> {
  const tail = `/product/view/${path.join("/")}`;

  // Old URLs are always two numeric ids. Anything else is a probe or a typo, and letting it reach
  // the query would put unescaped LIKE wildcards into the pattern.
  if (path.length !== 2 || !/^\d+$/.test(path[0]) || !/^\d+\.html$/.test(path[1])) {
    return NextResponse.redirect(new URL("/catalog", SITE_URL), 302);
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("products")
    .select("id")
    .like("product_url", `%${tail}`)
    .eq("published", true)
    .limit(1);

  if (error) console.error(`[legacy-redirect] lookup failed for ${tail}: ${error.message}`);

  const id = data?.[0]?.id;
  // No match: send them to the catalogue rather than a dead end, and keep it a 302 so a product
  // that is later republished isn't permanently cached away from its own URL.
  if (!id) return NextResponse.redirect(new URL("/catalog", SITE_URL), 302);

  return NextResponse.redirect(new URL(`/product/${id}`, SITE_URL), 301);
}
