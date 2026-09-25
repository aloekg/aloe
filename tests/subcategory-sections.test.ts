import { describe, expect, it } from "vitest";
import { buildCategorySection } from "@/lib/subcategory-sections";
import type { ProductListItem } from "@/types";

const product = (id: number, category_id: number): ProductListItem => ({
  id,
  name: `Товар ${id}`,
  price: 100,
  image_url: "https://example.test/a.jpg",
  category_id,
  purchase_count: 0,
  created_at: "2020-01-01T00:00:00+00:00",
  rating_sum: 0,
  rating_count: 0,
});

describe("buildCategorySection", () => {
  it("keeps everything flat when there are no sub-subcategories", () => {
    const products = [product(1, 10), product(2, 10)];
    const section = buildCategorySection({ id: 10, name: "Кремы" }, [], products);

    expect(section).toMatchObject({ id: 10, name: "Кремы", groups: [] });
    expect(section.products).toHaveLength(2);
  });

  it("buckets products under their sub-subcategory and leaves the rest at the top", () => {
    const products = [product(1, 10), product(2, 11), product(3, 12), product(4, 11)];
    const section = buildCategorySection(
      { id: 10, name: "Уход" },
      [
        { id: 11, name: "Для лица" },
        { id: 12, name: "Для тела" },
      ],
      products,
    );

    // Assigned directly to the subcategory — rendered without a sub-heading.
    expect(section.products.map((p) => p.id)).toEqual([1]);
    expect(section.groups.map((g) => [g.name, g.products.map((p) => p.id)])).toEqual([
      ["Для лица", [2, 4]],
      ["Для тела", [3]],
    ]);
  });

  it("omits sub-subcategories that ended up empty", () => {
    const section = buildCategorySection(
      { id: 10, name: "Уход" },
      [
        { id: 11, name: "Пустая" },
        { id: 12, name: "Непустая" },
      ],
      [product(1, 12)],
    );

    expect(section.groups.map((g) => g.name)).toEqual(["Непустая"]);
  });

  it("loses no product", () => {
    const products = [product(1, 10), product(2, 11), product(3, 99)];
    const section = buildCategorySection({ id: 10, name: "Уход" }, [{ id: 11, name: "Для лица" }], products);

    const seen = [...section.products, ...section.groups.flatMap((g) => g.products)].map((p) => p.id);
    expect(seen.sort()).toEqual([1, 2, 3]);
  });
});
