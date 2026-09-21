import { unstable_cache } from "next/cache";
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
  type SortValue,
} from "@/services/product.service";

/**
 * Every write path already invalidates by tag — `updateTag("products")` in app/admin/actions.ts on
 * each product, category and brand mutation, `updateTag("products-popular")` in checkout — so the
 * TTL is not what keeps the catalogue fresh. It is the backstop for the one case tags cannot cover:
 * a row edited in the Supabase dashboard rather than through the admin.
 *
 * It used to be 60s, which on Vercel's Hobby plan is the single largest consumer of the 200K/month
 * ISR-write budget: an entry expiring every minute is an entry rewritten every minute, and this file
 * mints one per product, per brand page, per category-and-sort combination. Ten minutes costs a
 * dashboard edit nine extra minutes of staleness and buys back roughly a tenth of the writes.
 *
 * Categories, brands and banners keep the longer window — they change a few times a year, and every
 * path that changes them tags them.
 */
const CATALOGUE_TTL = 600;
const REFERENCE_TTL = 3600;

export const getCachedCategories = unstable_cache(() => getCategories(supabase), ["categories"], {
  revalidate: REFERENCE_TTL,
  tags: ["categories"],
});

export const getCachedCategoriesWithSlug = unstable_cache(
  () => getCategoriesWithSlug(supabase),
  ["categories-with-slug"],
  { revalidate: REFERENCE_TTL, tags: ["categories"] },
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

/**
 * A Map cannot cross the unstable_cache boundary, so entries are cached as tuples and rebuilt.
 */
export const getCachedCategoryProducts = unstable_cache(
  // Args form the cache key, so [1,2] and [2,1] used to mint separate ~90 KB entries for an
  // identical payload. Callers sort before calling; this is the guarantee.
  async (categoryIds: number[], sort: SortValue) => {
    const byCategory = await getCategoryProducts(supabase, categoryIds, sort);
    return [...byCategory.entries()];
  },
  ["category-products"],
  { revalidate: CATALOGUE_TTL, tags: ["products"] },
);

/**
 * Product detail, shared by /product/[id] and the quick-view modal. The modal previously wrapped
 * the query in React `cache()`, which only dedupes within a single request — so every card click,
 * the most frequent interaction in the app, was a fresh Supabase round trip. Returns the row or
 * null rather than the PostgrestResponse, which is neither useful nor cheap to cache.
 */
export const getCachedProduct = unstable_cache(
  // `maybe`, not a bare `{ data }`: .single() reports an RLS denial or a network failure as
  // `{ data: null, error }`, and returning null here made both consumers call notFound() — which
  // then got written into the data cache for a whole TTL and into the ISR cache of /product/[id].
  async (id: number) => maybe("product", await getProduct(supabase, id)),
  ["product"],
  { revalidate: CATALOGUE_TTL, tags: ["products"] },
);

/** Keyed by category alone — see getRelatedProducts; the caller filters itself out of the pool. */
export const getCachedRelatedProducts = unstable_cache(
  (categoryId: number) => getRelatedProducts(supabase, categoryId),
  ["related-products"],
  { revalidate: CATALOGUE_TTL, tags: ["products"] },
);

/** /new and /sale queried Supabase directly on every request, unlike the homepage carousels. */
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
