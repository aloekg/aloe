import { describe, expect, it } from "vitest";
import { EMPTY_PRICE_RANGE, MAX_PRICE, parsePriceRange, type PriceRange } from "@/lib/page-params";
import {
  applyProductFilters,
  filterByPrice,
  filterCategorySections,
  priceBounds,
  sortProducts,
} from "@/lib/price-filter";

/** A list row, reduced to what filtering and sorting read. */
const p = (id: number, price: number, purchase_count = 0, created_at = "2020-01-01T00:00:00+00:00") => ({
  id,
  price,
  purchase_count,
  created_at,
});

const range = (min: number | null, max: number | null): PriceRange => ({ min, max });

describe("parsePriceRange", () => {
  it("reads a well-formed range", () => {
    expect(parsePriceRange("100", "500")).toEqual({ min: 100, max: 500 });
  });

  it("never produces NaN, whatever the URL says", () => {
    // The whole point of the helper: every one of these used to be able to reach a comparison.
    for (const value of ["abc", "-5", "", "   ", "1e400", "NaN", "Infinity", "3.7", "0x10", "1,5"]) {
      const { min, max } = parsePriceRange(value, value);
      expect(min === null || Number.isInteger(min)).toBe(true);
      expect(max === null || Number.isInteger(max)).toBe(true);
    }
  });

  it("rejects non-integers rather than rounding them", () => {
    expect(parsePriceRange("3.7", undefined)).toEqual(EMPTY_PRICE_RANGE);
  });

  it("accepts zero as a lower bound", () => {
    expect(parsePriceRange("0", undefined)).toEqual({ min: 0, max: null });
  });

  it("takes one bound without the other", () => {
    expect(parsePriceRange("100", undefined)).toEqual({ min: 100, max: null });
    expect(parsePriceRange(undefined, "500")).toEqual({ min: null, max: 500 });
  });

  it("caps at MAX_PRICE instead of letting a huge number through", () => {
    expect(parsePriceRange(undefined, "99999999999")).toEqual({ min: null, max: MAX_PRICE });
  });

  it("drops both bounds of an inverted range rather than swapping them", () => {
    // Swapping would render a range the customer never typed; dropping renders the unfiltered
    // list their impossible range actually matches.
    expect(parsePriceRange("500", "100")).toEqual(EMPTY_PRICE_RANGE);
  });

  it("keeps an equal pair, which selects exactly one price", () => {
    expect(parsePriceRange("300", "300")).toEqual({ min: 300, max: 300 });
  });
});

describe("filterByPrice", () => {
  const products = [p(1, 100), p(2, 200), p(3, 300)];

  it("returns the input untouched when no bound is set", () => {
    expect(filterByPrice(products, EMPTY_PRICE_RANGE)).toBe(products);
  });

  it("is inclusive on both bounds", () => {
    expect(filterByPrice(products, range(100, 300)).map((x) => x.id)).toEqual([1, 2, 3]);
    expect(filterByPrice(products, range(200, 200)).map((x) => x.id)).toEqual([2]);
  });

  it("applies one bound without the other", () => {
    expect(filterByPrice(products, range(200, null)).map((x) => x.id)).toEqual([2, 3]);
    expect(filterByPrice(products, range(null, 200)).map((x) => x.id)).toEqual([1, 2]);
  });

  it("can empty the set, which is a valid result and not a 404", () => {
    expect(filterByPrice(products, range(9_999_999, null))).toEqual([]);
  });
});

describe("sortProducts", () => {
  it("leaves `name` alone — the query already ordered it, with Postgres collation", () => {
    const products = [p(3, 300), p(1, 100), p(2, 200)];
    expect(sortProducts(products, "name")).toBe(products);
  });

  it("sorts ascending and descending by price", () => {
    const products = [p(3, 300), p(1, 100), p(2, 200)];
    expect(sortProducts(products, "price_asc").map((x) => x.id)).toEqual([1, 2, 3]);
    expect(sortProducts(products, "price_desc").map((x) => x.id)).toEqual([3, 2, 1]);
  });

  it("breaks ties by id, so the server and the client cannot disagree", () => {
    // Both sides sort this array; an unstable tiebreak is a hydration mismatch.
    const tied = [p(9, 100), p(4, 100), p(7, 100), p(1, 100)];
    expect(sortProducts(tied, "price_asc").map((x) => x.id)).toEqual([1, 4, 7, 9]);
    expect(sortProducts(tied, "price_desc").map((x) => x.id)).toEqual([1, 4, 7, 9]);
  });

  it("does not mutate its input", () => {
    const products = [p(3, 300), p(1, 100)];
    sortProducts(products, "price_asc");
    expect(products.map((x) => x.id)).toEqual([3, 1]);
  });
});

describe("sortProducts — популярные и новые", () => {
  it("ставит самые покупаемые вперёд", () => {
    const products = [p(1, 100, 3), p(2, 100, 17), p(3, 100, 0), p(4, 100, 9)];
    expect(sortProducts(products, "popular").map((x) => x.id)).toEqual([2, 4, 1, 3]);
  });

  it("разводит нули по id — это четыре товара из пяти в каталоге", () => {
    const products = [p(9, 100, 0), p(2, 100, 0), p(5, 100, 2), p(7, 100, 0)];
    expect(sortProducts(products, "popular").map((x) => x.id)).toEqual([5, 2, 7, 9]);
  });

  it("ставит недавно добавленные вперёд", () => {
    const products = [
      p(1, 100, 0, "2017-10-04T10:00:00+00:00"),
      p(2, 100, 0, "2026-09-20T14:40:51+00:00"),
      p(3, 100, 0, "2021-04-15T08:30:00+00:00"),
    ];
    expect(sortProducts(products, "newest").map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it("сравнивает моменты времени, а не строки — смещение зоны не должно решать", () => {
    // 2020-01-01T01:00+02:00 раньше, чем 2020-01-01T00:00+00:00, хотя как строка — позже.
    const products = [p(1, 100, 0, "2020-01-01T00:00:00+00:00"), p(2, 100, 0, "2020-01-01T01:00:00+02:00")];
    expect(sortProducts(products, "newest").map((x) => x.id)).toEqual([1, 2]);
  });

  it("разводит одинаковые даты по id", () => {
    const products = [p(8, 100), p(3, 100), p(5, 100)];
    expect(sortProducts(products, "newest").map((x) => x.id)).toEqual([3, 5, 8]);
  });

  it("не роняет порядок на нечитаемой дате", () => {
    const products = [p(2, 100, 0, "не дата"), p(1, 100, 0, "2020-01-01T00:00:00+00:00")];
    expect(sortProducts(products, "newest").map((x) => x.id)).toHaveLength(2);
  });

  it("не мутирует вход", () => {
    const products = [p(1, 100, 3), p(2, 100, 17)];
    sortProducts(products, "popular");
    expect(products.map((x) => x.id)).toEqual([1, 2]);
  });
});

describe("applyProductFilters", () => {
  it("narrows first, then orders", () => {
    const products = [p(1, 100), p(2, 500), p(3, 300), p(4, 50)];
    expect(applyProductFilters(products, range(100, 400), "price_desc").map((x) => x.id)).toEqual([3, 1]);
  });

  it("сужает по цене и для новых сортировок тоже", () => {
    const products = [p(1, 100, 5), p(2, 900, 99), p(3, 300, 1)];
    expect(applyProductFilters(products, range(null, 400), "popular").map((x) => x.id)).toEqual([1, 3]);
  });
});

describe("priceBounds", () => {
  it("returns null for an empty set rather than Infinity", () => {
    expect(priceBounds([])).toBeNull();
  });

  it("reports the cheapest and the dearest", () => {
    expect(priceBounds([p(1, 250), p(2, 90), p(3, 1200)])).toEqual({ min: 90, max: 1200 });
  });

  it("widens to whole сом so a placeholder never excludes its own product", () => {
    expect(priceBounds([p(1, 99.6), p(2, 250.4)])).toEqual({ min: 99, max: 251 });
  });
});

describe("filterCategorySections", () => {
  const sections = [
    {
      id: 1,
      name: "Порошки",
      products: [p(1, 100), p(2, 900)],
      groups: [
        { id: 11, name: "Автомат", products: [p(3, 200), p(4, 800)] },
        { id: 12, name: "Ручная стирка", products: [p(5, 5000)] },
      ],
    },
    { id: 2, name: "Гели", products: [p(6, 7000)], groups: [] },
  ];

  it("returns the input untouched when nothing is asked of it", () => {
    expect(filterCategorySections(sections, EMPTY_PRICE_RANGE, "name")).toBe(sections);
  });

  it("orders inside sections and groups, never across them", () => {
    const out = filterCategorySections(sections, EMPTY_PRICE_RANGE, "price_desc");
    expect(out.map((s) => s.id)).toEqual([1, 2]);
    expect(out[0].products.map((x) => x.id)).toEqual([2, 1]);
    expect(out[0].groups?.[0].products.map((x) => x.id)).toEqual([4, 3]);
  });

  it("drops a group the filter emptied, so no pill scrolls to nothing", () => {
    const out = filterCategorySections(sections, range(null, 1000), "name");
    expect(out[0].groups?.map((g) => g.id)).toEqual([11]);
  });

  it("drops a section whose every product and group was filtered out", () => {
    const out = filterCategorySections(sections, range(null, 1000), "name");
    expect(out.map((s) => s.id)).toEqual([1]);
  });

  it("keeps a section that kept only a group", () => {
    const out = filterCategorySections(sections, range(4000, null), "name");
    expect(out.map((s) => s.id)).toEqual([1, 2]);
    expect(out[0].products).toEqual([]);
    expect(out[0].groups?.map((g) => g.id)).toEqual([12]);
  });

  it("can empty the page entirely — a valid result, not a 404", () => {
    expect(filterCategorySections(sections, range(9_000_000, null), "name")).toEqual([]);
  });

  it("does not mutate the sections it was given", () => {
    filterCategorySections(sections, range(null, 150), "price_desc");
    expect(sections[0].products.map((x) => x.id)).toEqual([1, 2]);
    expect(sections[0].groups[0].products.map((x) => x.id)).toEqual([3, 4]);
  });
});
