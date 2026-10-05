import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CategoryBrowser, MobileHeader, NextCategoryLink } from "@/components";
import { getCachedBrands, getCachedCategoriesWithSlug, getCachedCategoryProducts } from "@/lib/cached-queries";
import { parseBrandIds, parsePriceRange, parseSortParam, type PriceRange, type SortValue } from "@/lib/page-params";
import { pageMetadata } from "@/lib/seo";
import { buildCategorySection } from "@/lib/subcategory-sections";
import type { Brand, ProductListItem } from "@/types";

/**
 * The brands this page's products carry, in getCachedBrands' order (by name, Postgres collation), and
 * the requested ids narrowed to them — an id from a stale link would otherwise empty the page.
 */
function brandFilter(products: ProductListItem[], allBrands: Brand[], requested: number[]) {
  const present = new Set(products.map((p) => p.brand_id));
  const options = allBrands.filter((b) => present.has(b.id)).map(({ id, name }) => ({ id, name }));
  const known = new Set(options.map((b) => b.id));
  return { options, selected: requested.filter((id) => known.has(id)) };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const allCategories = await getCachedCategoriesWithSlug();
  const category = allCategories?.find((c) => c.slug === slug);
  if (!category) return {};
  const parent = allCategories.find((c) => c.id === category.parent_id);
  if (parent?.parent_id) return {};
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
  searchParams: Promise<{
    sort?: string;
    sub?: string;
    price_min?: string;
    price_max?: string;
    brand?: string | string[];
  }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const sort = parseSortParam(sp.sort);
  const priceRange = parsePriceRange(sp.price_min, sp.price_max);
  const brandIds = parseBrandIds(sp.brand);

  const [allCategories, allBrands] = await Promise.all([getCachedCategoriesWithSlug(), getCachedBrands()]);

  const category = allCategories?.find((c) => c.slug === slug);
  if (!category) notFound();

  const parent = allCategories.find((c) => c.id === category.parent_id);
  // A sub-subcategory has no page of its own: it is a section of its subcategory's.
  if (parent?.parent_id) redirect(`/catalog/${parent.slug}?sub=${slug}`);

  const topCategory = parent ?? category;
  const subcategories = allCategories.filter((c) => c.parent_id === topCategory.id);

  const subSubsBySub = new Map(subcategories.map((s) => [s.id, allCategories.filter((c) => c.parent_id === s.id)]));
  // Sorted: the ids are an unstable_cache key, and admin drag-reorders re-permute them.
  // Always the whole top-level tree, so a subcategory page shares its category's cache entry.
  const allCategoryIds = subcategories
    .flatMap((s) => [s.id, ...(subSubsBySub.get(s.id) ?? []).map((c) => c.id)])
    .sort((a, b) => a - b);
  // No sort or price range in the cached call: each would mint a cache entry. Filtered on the result instead.
  const byCategory = new Map(await getCachedCategoryProducts(allCategoryIds));

  if (parent) {
    return (
      <SubcategoryPage
        subcategory={category}
        subSubcategories={subSubsBySub.get(category.id) ?? []}
        siblings={subcategories}
        byCategory={byCategory}
        sort={sort}
        priceRange={priceRange}
        brandIds={brandIds}
        allBrands={allBrands}
        activeSlug={sp.sub}
      />
    );
  }

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
  const brands = brandFilter(
    nonEmpty.flatMap((s) => s.products),
    allBrands,
    brandIds,
  );

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
        initialBrands={brands.selected}
        brandOptions={brands.options}
        initialSectionId={initialSectionId}
      >
        {nextCategory && nextCategory.id !== category.id && (
          <NextCategoryLink name={nextCategory.name} slug={nextCategory.slug} />
        )}
      </CategoryBrowser>
    </>
  );
}

type CategoryRow = { id: number; name: string; slug: string };

function SubcategoryPage({
  subcategory,
  subSubcategories,
  siblings,
  byCategory,
  sort,
  priceRange,
  brandIds,
  allBrands,
  activeSlug,
}: {
  subcategory: CategoryRow;
  subSubcategories: CategoryRow[];
  siblings: CategoryRow[];
  byCategory: Map<number, ProductListItem[]>;
  sort: SortValue;
  priceRange: PriceRange;
  brandIds: number[];
  allBrands: Brand[];
  activeSlug?: string;
}) {
  const sections = subSubcategories
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug, products: byCategory.get(c.id) ?? [], groups: [] }))
    .filter((s) => s.products.length > 0);
  const direct = byCategory.get(subcategory.id) ?? [];
  if (direct.length > 0) {
    sections.push({
      id: subcategory.id,
      name: sections.length > 0 ? "Другое" : subcategory.name,
      slug: subcategory.slug,
      products: direct,
      groups: [],
    });
  }
  if (sections.length === 0) notFound();

  const single = sections.length === 1;
  const pills = single ? [] : sections.map(({ id, name, slug }) => ({ id, name, slug }));
  const initialSectionId = sections.find((s) => s.slug === activeSlug)?.id;
  const brands = brandFilter(
    sections.flatMap((s) => s.products),
    allBrands,
    brandIds,
  );

  const index = siblings.findIndex((c) => c.id === subcategory.id);
  const next = siblings[(index + 1) % siblings.length];

  return (
    <>
      <MobileHeader title={subcategory.name} withBackButton />
      <h1 className="hidden md:block md:container md:mx-auto md:px-4 md:pt-2 md:text-2xl md:font-bold">
        {subcategory.name}
      </h1>

      <CategoryBrowser
        sections={sections.map(({ id, name, products, groups }) => ({
          id,
          name,
          products,
          groups,
          hideHeader: single,
        }))}
        subcategories={pills}
        initialSort={sort}
        initialRange={priceRange}
        initialBrands={brands.selected}
        brandOptions={brands.options}
        initialSectionId={initialSectionId}
      >
        {next && next.id !== subcategory.id && <NextCategoryLink name={next.name} slug={next.slug} />}
      </CategoryBrowser>
    </>
  );
}
