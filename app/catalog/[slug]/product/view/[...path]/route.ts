import { type NextRequest } from "next/server";
import { redirectLegacyProduct } from "@/lib/legacy-redirect";

// A static segment beats a dynamic one, so /catalog/product/view/... never lands here with slug="product".
export const revalidate = 86400;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return redirectLegacyProduct(path);
}
