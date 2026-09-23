import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CategoryBrowser, MobileHeader, NextCategoryLink } from "@/components";
import { getCachedCategoriesWithSlug, getCachedCategoryProducts } from "@/lib/cached-queries";
import { parsePriceRange, parseSortParam } from "@/lib/page-params";
import { pageMetadata } from "@/lib/seo";
import { buildCategorySection } from "@/lib/subcategory-sections";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const allCategories = await getCachedCategoriesWithSlug();
  const category = allCategories?.find((c) => c.slug === slug);
  if (!category || category.parent_id) return {};
  return pageMetadata({
    title: `${category.name} — купить в Бишкеке`,
    description: `${category.name}: широкий выбор товаров по выгодным ценам с доставкой по Бишкеку в интернет-магазине Aloe.kg.`,
    path: `/catalog/${slug}`,
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; sub?: string; price_min?: string; price_max?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const sort = parseSortParam(sp.sort);
  const priceRange = parsePriceRange(sp.price_min, sp.price_max);

  const allCategories = await getCachedCategoriesWithSlug();

  const category = allCategories?.find((c) => c.slug === slug);
  if (!category) notFound();

  if (category.parent_id) {
    const parent = allCategories?.find((c) => c.id === category.parent_id);
    redirect(`/catalog/${parent?.slug ?? slug}?sub=${slug}`);
  }

  const subcategories = allCategories.filter((c) => c.parent_id === category.id);

  // One query for the whole category rather than one per subcategory — every section renders on
  // this page anyway, so fifteen round trips bought nothing.
  const subSubsBySub = new Map(subcategories.map((s) => [s.id, allCategories.filter((c) => c.parent_id === s.id)]));
  // Sorted because getCachedCategoryProducts says callers do: the ids land in an unstable_cache
  // key, so [1,2] and [2,1] are two entries for one payload. The flatMap order follows
  // categories.sort_order, which a drag-reorder in the admin re-permutes.
  const allCategoryIds = subcategories
    .flatMap((s) => [s.id, ...(subSubsBySub.get(s.id) ?? []).map((c) => c.id)])
    .sort((a, b) => a - b);
  // No sort and no price range in that call — they are not part of what the category holds, and
  // folding them into the cache key would mint a fresh ~90 KB entry per combination. The filter is
  // applied to the result instead, below and again in CategoryBrowser.
  const byCategory = new Map(await getCachedCategoryProducts(allCategoryIds));

  const sections = subcategories.map((s) => {
    const subSubcategories = subSubsBySub.get(s.id) ?? [];
    const products = [s.id, ...subSubcategories.map((c) => c.id)].flatMap((id) => byCategory.get(id) ?? []);
    return { sub: s, subSubcategories, products, total: products.length };
  });

  // Decided on the *unfiltered* set, and it has to stay that way. A category exists or it does
  // not; a price range that matches nothing in it is an empty result, not a missing page. Moving
  // this below the filter would answer `?price_min=99999999` with a 404 on a real category — a
  // soft-404 in Search Console, and a contradiction of what app/sitemap.ts promises. Nobody would
  // find it by hand; a crawler would.
  const nonEmpty = sections.filter((s) => s.total > 0);
  if (!nonEmpty.length) notFound();

  const allSections = nonEmpty.map(({ sub, subSubcategories, products }) =>
    buildCategorySection(sub, subSubcategories, products),
  );

  // Only subcategories that actually rendered a section — a pill for an empty one would
  // scroll nowhere, since VirtualCategoryContent never received a matching section. Narrowing this
  // further to what the filter left is CategoryBrowser's job, since the filter moves with it.
  const visibleSubcategories = nonEmpty.map((s) => s.sub);

  const initialSectionId = visibleSubcategories.find((s) => s.slug === sp.sub)?.id;

  const topLevelCategories = allCategories.filter((c) => !c.parent_id);
  const currentIndex = topLevelCategories.findIndex((c) => c.id === category.id);
  const nextCategory = topLevelCategories[(currentIndex + 1) % topLevelCategories.length];

  return (
    <>
      <MobileHeader title={category.name} withBackButton />
      {/* `hidden`, not `sr-only`: MobileHeader now carries the <h1> below md, and an `sr-only` copy
          here would make the same name a second heading on a phone. */}
      <h1 className="hidden md:block md:container md:mx-auto md:px-4 md:pt-2 md:text-2xl md:font-bold">
        {category.name}
      </h1>

      <CategoryBrowser
        sections={allSections}
        subcategories={visibleSubcategories}
        initialSort={sort}
        initialRange={priceRange}
        initialSectionId={initialSectionId}
      >
        {nextCategory && nextCategory.id !== category.id && (
          <NextCategoryLink name={nextCategory.name} slug={nextCategory.slug} />
        )}
      </CategoryBrowser>
    </>
  );
}
