import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getBrandsForSearch, searchProducts } from "@/services/product.service";
import MainContainer from "./MainContainer";
import ManufacturerFilter from "./ManufacturerFilter";
import Pagination from "./Pagination";
import ProductCard from "./ProductCard";
import ProductGrid from "./ProductGrid";
import Title from "./Title";

export const SEARCH_PAGE_SIZE = 24;

type Props = {
  q: string;
  page: number;
  brandIds: number[];
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
  basePath,
  emptyHref = "/catalog",
  emptyLabel = "Вернуться в каталог",
  className = "mb-4",
}: Props) {
  const [{ products, total }, brands] = await Promise.all([
    searchProducts(supabase, q, { brandIds, page, pageSize: SEARCH_PAGE_SIZE }),
    getBrandsForSearch(supabase, q),
  ]);

  const totalPages = Math.ceil(total / SEARCH_PAGE_SIZE);

  return (
    <MainContainer>
      <div className={className}>
        <Title>
          Результаты поиска: <span className="text-green-600">«{q}»</span>
        </Title>
        <p className="text-sm text-gray-500 mt-1">Найдено: {total} товаров</p>
      </div>

      <ManufacturerFilter manufacturers={brands} className={className} />

      {products.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg">Ничего не найдено</p>
          <Link href={emptyHref} className="text-green-600 text-sm mt-2 inline-block hover:underline">
            {emptyLabel}
          </Link>
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
            query={brandIds.length > 0 ? { q, brand: brandIds.map(String) } : { q }}
          />
        </>
      )}
    </MainContainer>
  );
}
