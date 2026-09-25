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

  const subSubsBySub = new Map(subcategories.map((s) => [s.id, allCategories.filter((c) => c.parent_id === s.id)]));
  // Sorted: the ids are an unstable_cache key, and admin drag-reorders re-permute them.
  const allCategoryIds = subcategories
    .flatMap((s) => [s.id, ...(subSubsBySub.get(s.id) ?? []).map((c) => c.id)])
    .sort((a, b) => a - b);
  // No sort or price range in the cached call: each would mint a cache entry. Filtered on the result instead.
  const byCategory = new Map(await getCachedCategoryProducts(allCategoryIds));

  const sections = subcategories.map((s) => {
    const subSubcategories = subSubsBySub.get(s.id) ?? [];
    const products = [s.id, ...subSubcategories.map((c) => c.id)].flatMap((id) => byCategory.get(id) ?? []);
    return { sub: s, subSubcategories, products, total: products.length };
  });

  // Decided on the unfiltered set: a price range matching nothing is a 200, not a 404.
  const nonEmpty = sections.filter((s) => s.total > 0);
  if (!nonEmpty.length) notFound();

  const allSections = nonEmpty.map(({ sub, subSubcategories, products }) =>
    buildCategorySection(sub, subSubcategories, products),
  );

  const visibleSubcategories = nonEmpty.map((s) => s.sub);

  const initialSectionId = visibleSubcategories.find((s) => s.slug === sp.sub)?.id;

  const topLevelCategories = allCategories.filter((c) => !c.parent_id);
  const currentIndex = topLevelCategories.findIndex((c) => c.id === category.id);
  const nextCategory = topLevelCategories[(currentIndex + 1) % topLevelCategories.length];

  return (
    <>
      <MobileHeader title={category.name} withBackButton />
      {/* `hidden`, not `sr-only`: MobileHeader carries the <h1> below md. */}
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
