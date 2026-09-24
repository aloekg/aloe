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

/**
 * Every write path already invalidates by tag — `updateTag("products")` in app/admin/actions.ts on
 * each product, category and brand mutation, `updateTag("products-popular")` in checkout — so the
 * TTL is not what keeps the catalogue fresh. It is the backstop for the one case tags cannot cover:
 * a row edited in the Supabase dashboard rather than through the admin.
 *
 * It used to be 60s, which on Vercel's Hobby plan is the single largest consumer of the 200K/month
 * ISR-write budget: an entry expiring every minute is an entry rewritten every minute, and this file
 * mints one per product, per brand page, per category. Ten minutes costs a
 * dashboard edit nine extra minutes of staleness and buys back roughly a tenth of the writes.
 *
 * Categories, brands and banners keep the longer window — they change a few times a year, and every
 * path that changes them tags them.
 */
const CATALOGUE_TTL = 600;
const REFERENCE_TTL = 3600;

/**
 * `unstable_cache` does not dedupe within a request: generateMetadata and the page both ask for the
 * product, the layout and the category page both ask for the categories, and each call was its own
 * Data Cache read — a network hop on Vercel. React's `cache()` collapses them per request; the
 * wrappers below use it where a route is known to read the same thing twice.
 */
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

/**
 * A Map cannot cross the unstable_cache boundary, so entries are cached as tuples and rebuilt.
 */
export const getCachedCategoryProducts = unstable_cache(
  // Args form the cache key, so [1,2] and [2,1] used to mint separate ~90 KB entries for an
  // identical payload. Callers sort before calling; this is the guarantee.
  //
  // Nothing else may join them. A brand subset, a sort order and a price range are all forbidden
  // arguments here: each multiplies the number of ~90 KB entries this query mints for one payload,
  // and none of them changes which rows the category holds. `sort` was in this key before the
  // storefront had a control for it, costing up to three entries per category for a feature no
  // page exposed. The storefront filters and sorts the cached result instead — lib/price-filter.ts,
  // applied in app/catalog/[slug]/page.tsx and again on the client.
  async (categoryIds: number[]) => {
    const byCategory = await getCategoryProducts(supabase, categoryIds);
    return [...byCategory.entries()];
  },
  ["category-products"],
  { revalidate: CATALOGUE_TTL, tags: ["products"] },
);

/*
 * The three per-entity readers below build their `unstable_cache` wrapper *per call* rather than
 * once at module level. The tags of a module-level wrapper are fixed when the module loads, so
 * every product shared the single `products` tag and approving one review, or fixing one typo,
 * expired all 2400 detail entries and their pages (see lib/cache-tags.ts). Constructed inside the
 * function, the key and the tags can carry the id, and app/admin/actions.ts expires one product.
 * The wrapper object is cheap; the cache entry behind it is keyed by the key parts, not by the
 * wrapper's identity, so rebuilding it per call does not mint anything new.
 */

/**
 * Approved reviews of one product.
 *
 * Tagged with the product alone, not `products`: approving a review also moves the rating that
 * every card renders, but the cards catch up within CATALOGUE_TTL, and that lag is the trade —
 * previously one approval expired the whole catalogue so that the stars on a card were fresh a
 * few minutes sooner.
 *
 * Keyed by product id alone — no page, no sort. The page shows the most recent handful and there is
 * no pagination to mint an entry per page of.
 */
export function getCachedProductReviews(productId: number) {
  return unstable_cache(() => getProductReviews(supabase, productId), ["product-reviews", String(productId)], {
    revalidate: CATALOGUE_TTL,
    tags: [productTag(productId)],
  })();
}

/**
 * Product detail, shared by /product/[id] and the quick-view modal. The modal previously wrapped
 * the query in React `cache()`, which only dedupes within a single request — so every card click,
 * the most frequent interaction in the app, was a fresh Supabase round trip. Returns the row or
 * null rather than the PostgrestResponse, which is neither useful nor cheap to cache.
 *
 * Tagged both ways: `products` so a category rename or a bulk edit still reaches it, and its own
 * tag so an edit to this one row need not reach anything else.
 */
export const getCachedProduct = perRequest((id: number) =>
  unstable_cache(
    // `maybe`, not a bare `{ data }`: .single() reports an RLS denial or a network failure as
    // `{ data: null, error }`, and returning null here made both consumers call notFound() — which
    // then got written into the data cache for a whole TTL and into the ISR cache of /product/[id].
    async () => maybe("product", await getProduct(supabase, id)),
    ["product", String(id)],
    { revalidate: CATALOGUE_TTL, tags: ["products", productTag(id)] },
  )(),
);

/** Keyed by category alone — see getRelatedProducts; the caller filters itself out of the pool. */
export function getCachedRelatedProducts(categoryId: number) {
  return unstable_cache(() => getRelatedProducts(supabase, categoryId), ["related-products", String(categoryId)], {
    revalidate: CATALOGUE_TTL,
    tags: ["products", categoryTag(categoryId)],
  })();
}

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
