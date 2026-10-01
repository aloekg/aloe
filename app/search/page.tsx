import type { Metadata } from "next";
import MainContainer from "@/components/MainContainer";
import MobileHeader from "@/components/MobileHeader";
import MobileSearchInput from "@/components/MobileSearchInput";
import SearchResults from "@/components/SearchResults";
import Title from "@/components/Title";
import { parseBrandIds, parsePage, parsePriceRange, parseQuery, parseSortParam } from "@/lib/page-params";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  const q = parseQuery((await searchParams).q);
  return {
    title: q ? `${q} — поиск` : "Поиск",
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    brand?: string | string[];
    sort?: string;
    price_min?: string;
    price_max?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = parseQuery(sp.q);
  const currentPage = parsePage(sp.page);
  const selectedBrandIds = parseBrandIds(sp.brand);
  const sort = parseSortParam(sp.sort);
  const priceRange = parsePriceRange(sp.price_min, sp.price_max);

  if (!q) {
    return (
      <>
        <MobileHeader>
          <MobileSearchInput searchPath="/search" />
        </MobileHeader>
        <MainContainer>
          <Title className="sr-only">Поиск товаров</Title>
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">Введите название товара для поиска</p>
          </div>
        </MainContainer>
      </>
    );
  }

  return (
    <>
      <MobileHeader>
        <MobileSearchInput defaultValue={q} searchPath="/search" />
      </MobileHeader>
      <SearchResults
        q={q}
        page={currentPage}
        brandIds={selectedBrandIds}
        sort={sort}
        priceRange={priceRange}
        basePath="/search"
        emptyHref="/"
        emptyLabel="Вернуться в каталог"
        className="mb-4 md:mb-6"
      />
    </>
  );
}
