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
  basePath: string;
  emptyHref?: string;
  emptyLabel?: string;
  className?: string;
};

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
  // The brand facet ignores the price range on purpose: recomputing it per range is a costly scan.
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

  // A page past the end must 404, or every ?page= mints an indexable cache entry.
  if (page > 1 && products.length === 0) notFound();

  const totalPages = Math.ceil(total / SEARCH_PAGE_SIZE);

  const filtered = hasPriceRange(priceRange) || brandIds.length > 0;

  // Pagination must carry every active filter, or page 2 shows a different result set.
  return (
    <MainContainer>
      <div className={className}>
        <Title>
          Результаты поиска: <span className="text-green-700">«{q}»</span>
        </Title>
        <p className="text-sm text-gray-500 mt-1">Найдено: {total} товаров</p>
      </div>

      <ProductFilterBar variant="icons" sort={sort} range={priceRange} className={className} />
      <ProductFilterBar variant="inline" sort={sort} range={priceRange} className={className} />

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
