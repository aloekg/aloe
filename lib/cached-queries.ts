import { cache } from "react";
import { unstable_cache } from "next/cache";
import { categoryTag, productTag } from "@/lib/cache-tags";
import { maybe } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { getActiveBanners } from "@/services/banner.service";
import { getBrandBySlug, getBrands } from "@/services/brand.service";
import { getCategories, getCategoriesWithSlug } from "@/services/category.service";
import {
  getCategoryProducts,
  getHomePageCategoryProducts,
  getPopularProducts,
  getPopularProductsPaginated,
  getProduct,
  getProductsByBrand,
  getProductsByLabel,
  getProductsByLabelPaginated,
  getRelatedProducts,
} from "@/services/product.service";
import { getProductReviews } from "@/services/review.service";

// Tag invalidation keeps data fresh; the TTL is only a backstop, and a shorter one multiplies ISR writes.
const CATALOGUE_TTL = 600;
const REFERENCE_TTL = 3600;

// unstable_cache does not dedupe within a request; React cache() does.
const perRequest = cache;

export const getCachedCategories = perRequest(
  unstable_cache(() => getCategories(supabase), ["categories"], {
    revalidate: REFERENCE_TTL,
    tags: ["categories"],
  }),
);

export const getCachedCategoriesWithSlug = perRequest(
  unstable_cache(() => getCategoriesWithSlug(supabase), ["categories-with-slug"], {
    revalidate: REFERENCE_TTL,
    tags: ["categories"],
  }),
);

export const getCachedActiveBanners = unstable_cache(
  (type: "desktop" | "mobile") => getActiveBanners(supabase, type),
  ["banners"],
  { revalidate: REFERENCE_TTL, tags: ["banners"] },
);

export const getCachedProductsByLabel = unstable_cache(
  (label: "new" | "sale", limit?: number) => getProductsByLabel(supabase, label, limit),
  ["products-by-label"],
  { revalidate: CATALOGUE_TTL, tags: ["products"] },
);

export const getCachedPopularProducts = unstable_cache(
  (limit?: number) => getPopularProducts(supabase, limit),
  ["popular-products"],
  { revalidate: CATALOGUE_TTL, tags: ["products", "products-popular"] },
);

export const getCachedHomePageCategoryProducts = unstable_cache(
  (groups: Array<{ topId: number; allIds: number[] }>, limitPerCategory?: number) =>
    getHomePageCategoryProducts(supabase, groups, limitPerCategory),
  ["home-category-products"],
  { revalidate: CATALOGUE_TTL, tags: ["products"] },
);

export const getCachedBrands = unstable_cache(() => getBrands(supabase), ["brands"], {
  revalidate: REFERENCE_TTL,
  tags: ["brands"],
});

export const getCachedBrandBySlug = unstable_cache(
  (slug: string) => getBrandBySlug(supabase, slug),
  ["brand-by-slug"],
  { revalidate: REFERENCE_TTL, tags: ["brands"] },
);

export const getCachedProductsByBrand = unstable_cache(
  (brandId: number, page: number, pageSize: number) => getProductsByBrand(supabase, brandId, { page, pageSize }),
  ["products-by-brand"],
  { revalidate: CATALOGUE_TTL, tags: ["products"] },
);

// A Map cannot cross the unstable_cache boundary, so entries are cached as tuples.
export const getCachedCategoryProducts = unstable_cache(
  // Args are the cache key: callers sort the ids, and no brand/sort/price argument may be added.
  async (categoryIds: number[]) => {
    const byCategory = await getCategoryProducts(supabase, categoryIds);
    return [...byCategory.entries()];
  },
  ["category-products"],
  { revalidate: CATALOGUE_TTL, tags: ["products"] },
);

// Per-entity wrappers are built per call so tags can carry the id; entries are keyed by key parts.

// Product tag only, not `products`: card stars catching up within CATALOGUE_TTL is the accepted trade.
export function getCachedProductReviews(productId: number) {
  return unstable_cache(() => getProductReviews(supabase, productId), ["product-reviews", String(productId)], {
    revalidate: CATALOGUE_TTL,
    tags: [productTag(productId)],
  })();
}

export const getCachedProduct = perRequest((id: number) =>
  unstable_cache(
    // maybe(), not bare data: a swallowed error would cache a notFound() for a whole TTL.
    async () => maybe("product", await getProduct(supabase, id)),
    ["product", String(id)],
    { revalidate: CATALOGUE_TTL, tags: ["products", productTag(id)] },
  )(),
);

// Keyed by category alone; the caller filters the viewed product out of the pool.
export function getCachedRelatedProducts(categoryId: number) {
  return unstable_cache(() => getRelatedProducts(supabase, categoryId), ["related-products", String(categoryId)], {
    revalidate: CATALOGUE_TTL,
    tags: ["products", categoryTag(categoryId)],
  })();
}

export const getCachedProductsByLabelPaginated = unstable_cache(
  (label: string, page: number, pageSize: number) => getProductsByLabelPaginated(supabase, label, { page, pageSize }),
  ["products-by-label-paginated"],
  { revalidate: CATALOGUE_TTL, tags: ["products"] },
);

export const getCachedPopularProductsPaginated = unstable_cache(
  (page: number, pageSize: number) => getPopularProductsPaginated(supabase, { page, pageSize }),
  ["popular-products-paginated"],
  { revalidate: CATALOGUE_TTL, tags: ["products", "products-popular"] },
);
