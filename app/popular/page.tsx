import type { Metadata } from "next";
import { LabelProductsPage } from "@/components";
import { parsePage } from "@/lib/page-params";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const page = parsePage((await searchParams).page);
  // Page 2+ served the identical title and description with no canonical — textbook
  // duplicate-content dilution on a page the sitemap submits at priority 0.8.
  return pageMetadata({
    title: page > 1 ? "Популярные товары — страница " + page : "Популярные товары",
    description: "Самые популярные товары в интернет-магазине Aloe.kg по количеству покупок.",
    path: page > 1 ? "/popular?page=" + page : "/popular",
  });
}

export default async function PopularPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  return <LabelProductsPage label="popular" title="Популярные товары" basePath="/popular" page={parsePage(page)} />;
}
