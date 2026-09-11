import { requireAdmin } from "@/lib/auth";
import { getCategories } from "@/services/category.service";
import { getAdminProducts, type AdminProductsSort } from "@/services/product.service";
import AdminProducts from "../AdminProducts";

const DEFAULT_PAGE_SIZE = "20";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { db: supabase } = await requireAdmin();
  const sp = await searchParams;

  const currentPage = Math.max(1, parseInt(sp.page ?? "1") || 1);
  const q = sp.q ?? "";
  const label = sp.label ?? "";
  const published = sp.published ?? "";
  const category = sp.category ?? "";
  const categoryId = category === "none" ? "none" : category ? parseInt(category) || undefined : undefined;
  const sort = (sp.sort ?? "id-desc") as AdminProductsSort;
  const pageSizeParam = sp.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageSize = pageSizeParam === "all" ? "all" : Math.max(1, parseInt(pageSizeParam) || 20);

  const [{ products, total }, allCategories] = await Promise.all([
    getAdminProducts(supabase, { q, label, published, categoryId, sort, page: currentPage, pageSize }),
    getCategories(supabase),
  ]);

  const totalPages = pageSize === "all" ? 1 : Math.ceil(total / pageSize);

  // Products may only be assigned to "leaf" categories (a subcategory or sub-subcategory with
  // no children of its own) — top-level categories and categories that have sub-subcategories
  // are just organizational nodes, not something a product should link to directly. They're still
  // included in the select (disabled) so the tree structure is visible via indentation.
  function buildCategoryTree(
    parentId: number | null,
    depth: number,
  ): { id: number; name: string; depth: number; selectable: boolean }[] {
    return allCategories
      .filter((c) => c.parent_id === parentId)
      .flatMap((c) => {
        const selectable = !allCategories.some((child) => child.parent_id === c.id);
        return [{ id: c.id, name: c.name, depth, selectable }, ...buildCategoryTree(c.id, depth + 1)];
      });
  }
  const categories = buildCategoryTree(null, 0);

  return (
    <AdminProducts
      products={products}
      page={currentPage}
      totalPages={totalPages}
      total={total}
      q={q}
      label={label}
      published={published}
      category={category}
      sort={sort}
      pageSize={pageSizeParam}
      categories={categories}
    />
  );
}
