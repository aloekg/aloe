import { Suspense } from "react";
import type { Metadata } from "next";
import {
  BannerCarousel,
  Header,
  MainContainer,
  ProductCarousel,
  ProductGridSkeleton,
  Skeleton,
  Title,
} from "@/components";
import HeaderSearchInput from "@/components/header/HeaderSearchInput";
import {
  getCachedActiveBanners,
  getCachedCategoriesWithSlug,
  getCachedHomePageCategoryProducts,
  getCachedPopularProducts,
  getCachedProductsByLabel,
} from "@/lib/cached-queries";

// Deliberately not app/loading.tsx: that streams every route, so redirects stop being 307s and 404s become 200s.
async function CategoryCarousels({
  allCategories,
}: {
  allCategories: Awaited<ReturnType<typeof getCachedCategoriesWithSlug>>;
}) {
  const topCategories = allCategories.filter((c) => !c.parent_id);

  const subsByParent = new Map<number, number[]>();
  for (const c of allCategories) {
    if (c.parent_id) {
      if (!subsByParent.has(c.parent_id)) subsByParent.set(c.parent_id, []);
      subsByParent.get(c.parent_id)!.push(c.id);
    }
  }

  const groups = topCategories.map((cat) => {
    const subIds = subsByParent.get(cat.id) ?? [];
    const subSubIds = subIds.flatMap((id) => subsByParent.get(id) ?? []);
    return { topId: cat.id, allIds: [cat.id, ...subIds, ...subSubIds] };
  });

  const results = await getCachedHomePageCategoryProducts(groups);

  return (
    <>
      {topCategories.map((cat, i) => {
        const { products, total } = results[i];
        if (total === 0) return null;
        // One Suspense per carousel, no fallback: each row hydrates as its own interruptible task.
        return (
          <Suspense key={cat.id}>
            <ProductCarousel title={cat.name} href={`/catalog/${cat.slug}`} products={products} totalCount={total} />
          </Suspense>
        );
      })}
    </>
  );
}

export const metadata: Metadata = {
  title: { absolute: "Aloe.kg — бытовая химия и косметика с доставкой по Бишкеку" },
  description:
    "Интернет-магазин Aloe.kg: бытовая химия, косметика и товары для дома по выгодным ценам. Доставка по Бишкеку в день заказа.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [popular, newest, onSale, desktopBanners, mobileBanners, allCategories] = await Promise.all([
    getCachedPopularProducts(),
    getCachedProductsByLabel("new"),
    getCachedProductsByLabel("sale"),
    getCachedActiveBanners("desktop"),
    getCachedActiveBanners("mobile"),
    getCachedCategoriesWithSlug(),
  ]);

  return (
    <>
      <Header className="block md:hidden" logoOnly />
      <MainContainer className="flex flex-col gap-4 md:gap-8">
        <Title className="sr-only">Бытовая химия и косметика с доставкой по Бишкеку</Title>
        <HeaderSearchInput className="rounded-xl bg-green-50 md:hidden" />
        <div className="block md:hidden">
          <BannerCarousel banners={mobileBanners} media="mobile" />
        </div>
        <div className="hidden md:block">
          <BannerCarousel banners={desktopBanners} media="desktop" />
        </div>
        {/* Suspense per row with no fallback: each row hydrates as its own task. */}
        {popular.total > 0 && (
          <Suspense>
            <ProductCarousel
              title="Популярные товары"
              href="/popular"
              products={popular.products}
              totalCount={popular.total}
            />
          </Suspense>
        )}
        {newest.total > 0 && (
          <Suspense>
            <ProductCarousel title="Новинки" href="/new" products={newest.products} totalCount={newest.total} />
          </Suspense>
        )}
        {onSale.total > 0 && (
          <Suspense>
            <ProductCarousel title="Акции" href="/sale" products={onSale.products} totalCount={onSale.total} />
          </Suspense>
        )}
        <Suspense
          fallback={Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <Skeleton className="h-6 w-48" />
              <ProductGridSkeleton count={6} />
            </div>
          ))}
        >
          <CategoryCarousels allCategories={allCategories} />
        </Suspense>
      </MainContainer>
    </>
  );
}
