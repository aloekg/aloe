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
  return pageMetadata({
    title: page > 1 ? "Акции — страница " + page : "Акции",
    description: "Товары со скидкой в интернет-магазине Aloe.kg: бытовая химия и косметика по акционным ценам.",
    path: page > 1 ? "/sale?page=" + page : "/sale",
  });
}

export default async function SalePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  return <LabelProductsPage label="sale" title="Акции" basePath="/sale" emptyText="Акций нет" page={parsePage(page)} />;
}
