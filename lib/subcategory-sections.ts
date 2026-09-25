import type { ProductListItem } from "@/types";

export function buildCategorySection(
  subcategory: { id: number; name: string },
  subSubcategories: { id: number; name: string }[],
  products: ProductListItem[],
): {
  id: number;
  name: string;
  products: ProductListItem[];
  groups: { id: number; name: string; products: ProductListItem[] }[];
} {
  if (subSubcategories.length === 0) {
    return { id: subcategory.id, name: subcategory.name, products, groups: [] };
  }

  const byId = new Map(
    subSubcategories.map((c) => [c.id, { id: c.id, name: c.name, products: [] as ProductListItem[] }]),
  );
  const rest: ProductListItem[] = [];
  for (const p of products) {
    const bucket = byId.get(p.category_id);
    if (bucket) bucket.products.push(p);
    else rest.push(p);
  }

  const groups = subSubcategories.map((c) => byId.get(c.id)!).filter((g) => g.products.length > 0);
  return { id: subcategory.id, name: subcategory.name, products: rest, groups };
}
