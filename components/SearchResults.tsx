import Link from "next/link";
import { notFound } from "next/navigation";
import { getCachedBrands } from "@/lib/cached-queries";
import { hasPriceRange, type PriceRange, type SortValue } from "@/lib/page-params";
import { supabase } from "@/lib/supabase";
import { getBrandIdsForSearch, searchProducts } from "@/services/product.service";
import MainContainer from "./MainContainer";
import ManufacturerFilter from "./ManufacturerFilter";
import Pagination from "./Pagination";
import ProductCard from "./ProductCard";
import ProductFilterBar from "./ProductFilterBar";
import ProductGrid from "./ProductGrid";
import Title from "./Title";

export const SEARCH_PAGE_SIZE = 24;

type Props = {
  q: string;
  page: number;
  brandIds: number[];
  sort: SortValue;
  priceRange: PriceRange;
  /** Which route rendered this, so pagination links and the empty state point back correctly. */
  basePath: string;
  emptyHref?: string;
  emptyLabel?: string;
  className?: string;
};

/**
 * The search result body, shared by /search and /catalog?q= — the two used to carry ~60 lines of
 * identical markup and query plumbing, which meant two crawlable URLs rendering the same result
 * set from two copies of the same code.
 */
export default async function SearchResults({
  q,
  page,
  brandIds,
  sort,
  priceRange,
  basePath,
  emptyHref = "/catalog",
  emptyLabel = "Вернуться в каталог",
  className = "mb-4",
}: Props) {
  // The facet query returns ids; the names come from the brand list that is cached for an hour
  // anyway, so a broad search no longer carries a join on every page of matches. `getCachedBrands`
  // is already ordered by name, which is the order the filter renders in.
  //
  // The facet is deliberately computed from the query alone, so it does not narrow as the price
  // does. Recomputing it per price range would mean scanning up to five pages of a thousand rows on
  // every keystroke of a public, unauthenticated, unrated route — and a facet that keeps offering
  // the brands the search matched is the behaviour customers expect anyway.
  const [{ products, total }, facetBrandIds, allBrands] = await Promise.all([
    searchProducts(supabase, q, {
      brandIds,
      page,
      pageSize: SEARCH_PAGE_SIZE,
      priceMin: priceRange.min,
      priceMax: priceRange.max,
      sort,
    }),
    getBrandIdsForSearch(supabase, q),
    getCachedBrands(),
  ]);
  const facet = new Set(facetBrandIds);
  const brands = allBrands.filter((b) => facet.has(b.id));

  // Same reasoning as LabelProductsPage: page 1 with no matches is a legitimate "ничего не
  // найдено", a page past the end is not.
  if (page > 1 && products.length === 0) notFound();

  const totalPages = Math.ceil(total / SEARCH_PAGE_SIZE);

  // Whether an empty result is "no such product" or "no product in this range" — the two need
  // different ways out, and offering "вернуться в каталог" to someone who simply set the price too
  // low sends them away from the search that would have worked.
  const filtered = hasPriceRange(priceRange) || brandIds.length > 0;

  return (
    <MainContainer>
      <div className={className}>
        <Title>
          Результаты поиска: <span className="text-green-700">«{q}»</span>
        </Title>
        <p className="text-sm text-gray-500 mt-1">Найдено: {total} товаров</p>
      </div>

      <ProductFilterBar sort={sort} range={priceRange} className={className} />

      <ManufacturerFilter manufacturers={brands} className={className} />

      {products.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          {filtered ? (
            <>
              <p className="text-lg">По выбранным фильтрам ничего не найдено</p>
              <Link
                href={`${basePath}?q=${encodeURIComponent(q)}`}
                className="text-green-700 text-sm mt-2 inline-block hover:underline"
              >
                Сбросить фильтры
              </Link>
            </>
          ) : (
            <>
              <p className="text-lg">Ничего не найдено</p>
              <Link href={emptyHref} className="text-green-700 text-sm mt-2 inline-block hover:underline">
                {emptyLabel}
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <ProductGrid>
            {products.map((p, i) => (
              <ProductCard key={p.id} product={p} preload={i === 0} />
            ))}
          </ProductGrid>
          {/* Every active filter has to ride along: these are the only crawlable links on the page,
              and a page-2 link that drops the filter silently shows a different result set. */}
          <Pagination
            page={page}
            totalPages={totalPages}
            basePath={basePath}
            query={{
              q,
              ...(brandIds.length > 0 && { brand: brandIds.map(String) }),
              ...(sort !== "name" && { sort }),
              ...(priceRange.min != null && { price_min: String(priceRange.min) }),
              ...(priceRange.max != null && { price_max: String(priceRange.max) }),
            }}
          />
        </>
      )}
    </MainContainer>
  );
}
