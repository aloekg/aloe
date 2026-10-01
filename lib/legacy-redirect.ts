import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// Relative Location on purpose: an absolute URL would bake one host into the cached 301.
// NextResponse.redirect requires an absolute URL, hence the bare response.
function redirectTo(path: string, status: 301 | 302): NextResponse {
  return new NextResponse(null, { status, headers: { Location: path } });
}

// Matches the /product/view/<cat>/<id>.html tail: product_url stores the short form, Google indexed the long one.
export async function redirectLegacyProduct(path: string[]): Promise<NextResponse> {
  const tail = `/product/view/${path.join("/")}`;

  // Validate before the query, or unescaped LIKE wildcards reach the pattern.
  if (path.length !== 2 || !/^\d+$/.test(path[0]) || !/^\d+\.html$/.test(path[1])) {
    return redirectTo("/catalog", 302);
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
  // 302, not 301, so a product republished later can reclaim its URL.
  if (!id) return redirectTo("/catalog", 302);

  return redirectTo(`/product/${id}`, 301);
}
