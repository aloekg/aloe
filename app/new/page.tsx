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
    title: page > 1 ? "Новинки — страница " + page : "Новинки",
    description: "Новые товары в интернет-магазине Aloe.kg: свежие поступления бытовой химии и косметики.",
    path: page > 1 ? "/new?page=" + page : "/new",
  });
}

export default async function NewPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  return <LabelProductsPage label="new" title="Новинки" basePath="/new" page={parsePage(page)} />;
}
