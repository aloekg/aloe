import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb, MainContainer, Title } from "@/components";
import { getCachedBrandBySlug, getCachedProductsByBrand } from "@/lib/cached-queries";
import { pageMetadata } from "@/lib/seo";
import BrandProductsInfinite from "./BrandProductsInfinite";

const PAGE_SIZE = 24;

export async function generateMetadata({ params }: { params: Promise<{ brand: string }> }): Promise<Metadata> {
  const { brand } = await params;
  const data = await getCachedBrandBySlug(brand);
  if (!data) return {};
  return pageMetadata({
    title: `${data.name} — Бренды`,
    description: `Товары бренда ${data.name} в интернет-магазине Aloe.kg. Доставка по Бишкеку.`,
    path: `/brands/${brand}`,
  });
}

export default async function BrandPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;

  const brandData = await getCachedBrandBySlug(brand);

  if (!brandData) notFound();

  const { products, total } = await getCachedProductsByBrand(brandData.id, 1, PAGE_SIZE);

  if (!total) notFound();

  return (
    <MainContainer>
      <Breadcrumb
        crumbs={[{ label: "Главная", href: "/" }, { label: "Бренды", href: "/brands" }, { label: brandData.name }]}
      />
      <Title className="mb-4 md:mb-6">{brandData.name}</Title>

      <BrandProductsInfinite
        key={brandData.id}
        brandId={brandData.id}
        brandName={brandData.name}
        pageSize={PAGE_SIZE}
        initialProducts={products}
        total={total}
      />
    </MainContainer>
  );
}
