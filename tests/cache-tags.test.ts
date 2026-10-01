import { describe, expect, it } from "vitest";
import { categoryTag, productTag, touchesListings } from "@/lib/cache-tags";

describe("cache tags", () => {
  it("spell one product and one category the same way for reader and writer", () => {
    expect(productTag(42)).toBe("product-42");
    expect(categoryTag(7)).toBe("category-7");
  });
});

describe("touchesListings", () => {
  const row = { name: "Tide", price: 350, old_price: null, label: "sale", brand_id: 3, published: true };

  it("is false for an edit that only the product page shows", () => {
    expect(touchesListings(row, { description: "new text", seo_text: "x" } as Record<string, unknown>)).toBe(false);
  });

  it("is false when the list fields are sent back unchanged", () => {
    expect(touchesListings(row, { ...row })).toBe(false);
  });

  it.each([
    ["the price", { price: 340 }],
    ["the name", { name: "Tide Color" }],
    ["the label", { label: null }],
    ["the brand", { brand_id: 4 }],
    ["publication", { published: false }],
    ["an old price appearing", { old_price: 400 }],
  ])("is true when %s changes", (_what, next) => {
    expect(touchesListings(row, next)).toBe(true);
  });

  it("treats null and undefined as the same absence", () => {
    expect(touchesListings({ old_price: null }, { old_price: undefined })).toBe(false);
    expect(touchesListings({ brand_id: undefined }, { brand_id: null })).toBe(false);
  });

  it("ignores keys the update does not mention", () => {
    expect(touchesListings({ price: 100 }, {})).toBe(false);
  });
});
