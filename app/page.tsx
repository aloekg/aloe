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

/**
 * The category carousels depend on the category list, so they cannot join the Promise.all above.
 * Wrapping just this section keeps the banners and the popular/new/sale rows from waiting on it.
 *
 * Deliberately not an app/loading.tsx: that file is the fallback for *every* route without its
 * own, which makes the whole app stream — and once the response has started, auth redirects stop
 * being 307s and notFound() cannot set 404.
 */
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
        // One Suspense boundary per carousel, with the content already in the HTML: React then
        // hydrates each in its own task instead of the whole page in one, yielding to a tap in
        // between — see the note on the popular/new/sale rows below.
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
        {/* The carousels below are h2s; without this the site's most important page had no h1. */}
        <Title className="sr-only">Бытовая химия и косметика с доставкой по Бишкеку</Title>
        {/*
          The mobile header above carries only the logo, and every other mobile route has its own
          MobileHeader field — this was the one place a phone could not search from. The field is
          transparent and borderless below md (see SearchInput), so the tinted pill is what makes
          it read as a field on the page's white background.
        */}
        <HeaderSearchInput className="rounded-xl bg-green-50 md:hidden" />
        <div className="block md:hidden">
          <BannerCarousel banners={mobileBanners} media="mobile" />
        </div>
        <div className="hidden md:block">
          <BannerCarousel banners={desktopBanners} media="desktop" />
        </div>
        {/*
          Each row in its own Suspense boundary, with no fallback. Nothing suspends here — the data
          is already in hand — so nothing ever shows a fallback; the boundary is for hydration. A
          server-rendered Suspense boundary is hydrated by React as a unit of its own, at low
          priority and interruptible, so the home page's ~170 cards are hydrated row by row rather
          than in one long task, and a tap on the first row is answered before the last row has
          been touched. Without the boundaries the whole page is one hydration task.
        */}
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
