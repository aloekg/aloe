import { type NextRequest } from "next/server";
import { redirectLegacyProduct } from "@/lib/legacy-redirect";

export const revalidate = 86400;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return redirectLegacyProduct(path);
}
