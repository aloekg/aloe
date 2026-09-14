import { type NextRequest } from "next/server";
import { redirectLegacyProduct } from "@/lib/legacy-redirect";

/**
 * 301s the previous site's category-prefixed product URLs — the shape its sitemap submitted, and
 * so the shape Google indexed. The `slug` segment is matched but unused; see lib/legacy-redirect.ts.
 *
 * A static segment beats a dynamic one in Next's routing, so `/catalog/product/view/...` still
 * lands on the sibling route above rather than here with slug="product".
 */
export const revalidate = 86400;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return redirectLegacyProduct(path);
}
