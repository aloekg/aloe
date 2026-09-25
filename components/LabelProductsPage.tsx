import { notFound } from "next/navigation";
import { getCachedPopularProductsPaginated, getCachedProductsByLabelPaginated } from "@/lib/cached-queries";
import MainContainer from "./MainContainer";
import Pagination from "./Pagination";
import ProductCard from "./ProductCard";
import ProductGrid from "./ProductGrid";

const PAGE_SIZE = 20;

interface Props {
  label: string;
  title: string;
  basePath: string;
  emptyText?: string;
  page: number;
}

export default async function LabelProductsPage({
  label,
  title,
  basePath,
  emptyText = "Товары не добавлены",
  page,
}: Props) {
  const { products, total } =
    label === "popular"
      ? await getCachedPopularProductsPaginated(page, PAGE_SIZE)
      : await getCachedProductsByLabelPaginated(label, page, PAGE_SIZE);
  // A page past the end is a 404, not an empty 200: see MAX_PAGE in lib/page-params.ts.
  if (page > 1 && products.length === 0) notFound();

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <MainContainer>
      <h1 className="text-lg font-semibold mb-4 text-center md:text-left">{title}</h1>

      {products.length === 0 ? (
        <p className="text-gray-500 text-sm">{emptyText}</p>
      ) : (
        <>
          <ProductGrid>
            {products.map((p, i) => (
              <ProductCard key={p.id} product={p} preload={i === 0} />
            ))}
          </ProductGrid>
          <Pagination page={page} totalPages={totalPages} basePath={basePath} />
        </>
      )}
    </MainContainer>
  );
}
