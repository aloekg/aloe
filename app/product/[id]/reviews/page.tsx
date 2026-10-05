import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MainContainer, MobileHeader, ProductReviews, Title } from "@/components";
import { getCachedProduct, getCachedProductReviews } from "@/lib/cached-queries";
import { averageRating, reviewPlural } from "@/lib/reviews";
import { pageMetadata } from "@/lib/seo";

// Must match PRODUCT_TTL in lib/cached-queries.ts, like /product/[id].
export const revalidate = 86400;

// Rendered on first visit and cached, never prerendered: only rated products have this page.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await getCachedProduct(Number(id));
  const average = product && averageRating(product.rating_sum, product.rating_count);
  if (!product || !average) return {};
  return pageMetadata({
    title: `Отзывы — ${product.name}`,
    description: `${product.rating_count} ${reviewPlural(product.rating_count)} покупателей о товаре «${product.name}», средняя оценка ${average.toFixed(1).replace(".", ",")} из 5.`,
    path: `/product/${product.id}/reviews`,
  });
}

export default async function ProductReviewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getCachedProduct(Number(id));
  // An unrated product has nothing here: a 404 rather than an indexable empty page.
  if (!product || product.rating_count === 0) notFound();

  const reviews = await getCachedProductReviews(product.id);
  if (reviews.length === 0) notFound();

  const productHref = `/product/${product.id}`;

  return (
    <>
      <MobileHeader title="Отзывы" withBackButton />
      <MainContainer className="max-w-3xl">
        <Title className="hidden md:block mb-4">Отзывы</Title>

        <Link href={productHref} className="flex items-center gap-3 mb-6 group w-fit">
          <span className="relative size-16 shrink-0 rounded-lg bg-gray-50 overflow-hidden">
            <Image
              src={product.thumbnail_url || product.image_url}
              alt=""
              fill
              className="object-contain p-1"
              sizes="64px"
            />
          </span>
          <span className="text-sm font-medium group-hover:underline">{product.name}</span>
        </Link>

        <ProductReviews
          reviews={reviews}
          ratingSum={product.rating_sum}
          ratingCount={product.rating_count}
          hideHeading
          className="mb-12"
        />
      </MainContainer>
    </>
  );
}
