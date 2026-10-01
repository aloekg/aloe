"use server";

import { getCachedProductsByBrand } from "@/lib/cached-queries";
import { BRAND_MAX_PAGE, BRAND_PAGE_SIZE } from "./pagination";

// Public endpoint whose arguments become a cache key: keep the page size a constant, never an argument.
export async function loadMoreBrandProducts(brandId: number, page: number) {
  const id = Math.trunc(Number(brandId));
  if (!Number.isInteger(id) || id <= 0) return { products: [], total: 0 };

  const safePage = Math.min(Math.max(1, Math.trunc(Number(page)) || 1), BRAND_MAX_PAGE);

  return getCachedProductsByBrand(id, safePage, BRAND_PAGE_SIZE);
}
