import { describe, expect, it } from "vitest";
import type { AnalyticsOrderRow, CustomerSeenRow } from "@/lib/analytics";
import {
  buildCancellations,
  buildCatalogueIndex,
  buildFavorites,
  buildHeatmap,
  buildInsights,
  buildPromo,
  buildRepeat,
  buildThreshold,
  buildUnsold,
  namedBreakdowns,
  type CatalogueProductRow,
  type ProductMeta,
} from "@/lib/analytics-insights";
import { FREE_DELIVERY_THRESHOLD } from "@/lib/constants";
import type { OrderItem } from "@/types";

function item(id: number, price: number, quantity = 1): OrderItem {
  return { id, name: `Товар ${id}`, price, quantity, image_url: "" };
}

function order(overrides: Partial<AnalyticsOrderRow> = {}): AnalyticsOrderRow {
  return {
    id: 1,
    user_id: null,
    customer_phone: "0555000001",
    total: 1200,
    delivery_cost: 200,
    delivery_type: "center",
    status: "delivered",
    created_at: "2026-09-15T06:00:00Z",
    items: [item(1, 1000)],
    ...overrides,
  };
}

function product(overrides: Partial<CatalogueProductRow> & Pick<CatalogueProductRow, "id">): CatalogueProductRow {
  return {
    name: `Товар ${overrides.id}`,
    price: 100,
    old_price: null,
    label: null,
    brand_id: null,
    category_id: null,
    published: true,
    purchase_count: 0,
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function seen(phone: string, createdAt: string, status = "delivered"): CustomerSeenRow {
  return { user_id: null, customer_phone: phone, created_at: createdAt, status };
}

describe("buildCatalogueIndex", () => {
  const categories = [
    { id: 1, name: "Для уборки", parent_id: null },
    { id: 2, name: "Средства для пола", parent_id: 1 },
    { id: 3, name: "Для ламината", parent_id: 2 },
  ];

  it("rolls a product up to its top-level category from either depth", () => {
    const index = buildCatalogueIndex(
      [product({ id: 10, category_id: 3 }), product({ id: 11, category_id: 2 }), product({ id: 12 })],
      categories,
      [],
    );
    expect(index.get(10)?.category).toEqual({ id: 1, name: "Для уборки" });
    expect(index.get(11)?.category).toEqual({ id: 1, name: "Для уборки" });
    expect(index.get(12)?.category).toBeNull();
  });

  it("treats a product as promo by its label or by a higher old price, not by an old price alone", () => {
    const index = buildCatalogueIndex(
      [
        product({ id: 1, label: "sale" }),
        product({ id: 2, price: 100, old_price: 150 }),
        product({ id: 3, price: 100, old_price: 100 }),
        product({ id: 4, label: "new" }),
      ],
      [],
      [],
    );
    expect([1, 2, 3, 4].map((id) => index.get(id)?.promo)).toEqual([true, true, false, false]);
  });
});

describe("namedBreakdowns", () => {
  it("ranks categories and brands by revenue, with a bucket for the unknown", () => {
    const catalogue = buildCatalogueIndex(
      [product({ id: 10, category_id: 1, brand_id: 7 }), product({ id: 20, category_id: 2 })],
      [
        { id: 1, name: "Уборка", parent_id: null },
        { id: 2, name: "Стирка", parent_id: null },
      ],
      [{ id: 7, name: "Frosch" }],
    );
    const rows = [
      order({ items: [item(10, 100, 2), item(20, 500)] }),
      order({ id: 2, items: [item(10, 100, 3), item(99, 50)] }),
    ];
    const { categories, brands } = namedBreakdowns(rows, catalogue);

    expect(categories.map((c) => [c.name, c.revenue])).toEqual([
      ["Уборка", 500],
      ["Стирка", 500],
      ["Без категории", 50],
    ]);
    expect(brands[0]).toEqual({ id: null, name: "Без бренда", quantity: 2, revenue: 550 });
    expect(brands[1]).toEqual({ id: 7, name: "Frosch", quantity: 5, revenue: 500 });
  });
});

describe("buildHeatmap", () => {
  it("places orders on Bishkek's weekday and hour and names the peak", () => {
    const heatmap = buildHeatmap([
      // Thursday 2026-09-17, 18:xx local (12:xx UTC) — twice.
      order({ created_at: "2026-09-17T12:10:00Z" }),
      order({ created_at: "2026-09-17T12:50:00Z" }),
      // Sunday night UTC is already Monday 01:00 in Bishkek.
      order({ created_at: "2026-09-20T19:00:00Z" }),
    ]);
    expect(heatmap.cells[3][18]).toBe(2);
    expect(heatmap.cells[0][1]).toBe(1);
    expect(heatmap.peak).toEqual({ weekday: 3, hour: 18, orders: 2 });
    expect(heatmap.max).toBe(2);
  });

  it("has no peak without orders", () => {
    expect(buildHeatmap([])).toMatchObject({ max: 0, peak: null });
  });
});

describe("buildPromo", () => {
  it("measures promo sales against goods revenue, and promo reach against the published catalogue", () => {
    const catalogue = buildCatalogueIndex(
      [
        product({ id: 1, label: "sale" }),
        product({ id: 2 }),
        product({ id: 3, label: "sale" }),
        product({ id: 4, label: "sale", published: false }),
      ],
      [],
      [],
    );
    const promo = buildPromo(
      [order({ total: 1200, delivery_cost: 200, items: [item(1, 250, 2), item(2, 500)] })],
      catalogue,
    );
    expect(promo).toEqual({
      goodsRevenue: 1000,
      promoRevenue: 500,
      promoQuantity: 2,
      soldProducts: 1,
      // The unpublished one cannot be sold, so it is not a promo product nobody bought.
      catalogueProducts: 2,
    });
  });
});

describe("buildThreshold", () => {
  const T = FREE_DELIVERY_THRESHOLD;
  const goods = (value: number, zone = "center") =>
    order({ total: value + (value >= T ? 0 : 200), delivery_cost: value >= T ? 0 : 200, delivery_type: zone });

  it("bins baskets by goods total and counts those either side of the threshold", () => {
    const result = buildThreshold([
      goods(T - 500),
      goods(T - 1500),
      goods(T),
      goods(T + 1999),
      goods(T + 2000),
      goods(300),
    ]);
    expect(result.orders).toBe(6);
    expect(result.nearMiss).toBe(2);
    expect(result.justOver).toBe(2);
    expect(result.bins[0].orders).toBe(1);
    expect(result.bins.find((b) => b.from === T)?.orders).toBe(1);
    expect(result.bins.reduce((sum, b) => sum + b.orders, 0)).toBe(6);
  });

  it("puts anything past the last bin into the open-ended one", () => {
    const result = buildThreshold([goods(90_000)]);
    expect(result.bins.at(-1)).toMatchObject({ to: null, orders: 1 });
  });

  it("ignores zones where the threshold changes nothing", () => {
    expect(buildThreshold([goods(T - 500, "residential"), goods(T - 500, "regions")]).orders).toBe(0);
  });
});

describe("buildCancellations", () => {
  it("rates zones and products, counting a product once per order and skipping one-off anecdotes", () => {
    const result = buildCancellations([
      order({ id: 1, status: "cancelled", delivery_type: "regions", items: [item(1, 100), item(1, 100), item(2, 50)] }),
      order({ id: 2, status: "delivered", delivery_type: "regions", items: [item(1, 100)] }),
      order({ id: 3, status: "cancelled", delivery_type: null, items: [item(1, 100)] }),
    ]);

    expect(result).toMatchObject({ total: 3, cancelled: 2 });
    expect(result.byZone).toEqual([
      { id: "regions", orders: 2, cancelled: 1 },
      { id: "unknown", orders: 1, cancelled: 1 },
    ]);
    // Product 2 was cancelled in its only order — not enough to call it a pattern.
    expect(result.byProduct).toEqual([{ id: 1, name: "Товар 1", orders: 3, cancelled: 2 }]);
  });
});

describe("buildRepeat", () => {
  it("follows the period's new customers to their second order, whenever it came", () => {
    const history = [
      // New in the period, came back 10 days later — after the period ended.
      seen("0555111111", "2026-09-10T06:00:00Z"),
      seen("0555111111", "2026-09-20T06:00:00Z"),
      // New in the period, has not returned.
      seen("0555222222", "2026-09-12T06:00:00Z"),
      // An old customer: not part of the period's cohort.
      seen("0555333333", "2026-01-01T06:00:00Z"),
      seen("0555333333", "2026-09-11T06:00:00Z"),
      // Their only other order was cancelled — they have not really come back.
      seen("0555444444", "2026-09-13T06:00:00Z"),
      seen("0555444444", "2026-09-14T06:00:00Z", "cancelled"),
    ];
    const counted = [
      order({ customer_phone: "0555111111" }),
      order({ customer_phone: "0555333333" }),
      order({ customer_phone: "0555444444" }),
    ];
    const result = buildRepeat(history, counted, "2026-09-10", "2026-09-16");

    expect(result.cohort).toBe(3);
    expect(result.returned).toBe(1);
    expect(result.medianDaysToSecond).toBe(10);
    expect(result.lifetime).toEqual([
      { label: "1 заказ", customers: 1 },
      { label: "2 заказа", customers: 2 },
      { label: "3–4 заказа", customers: 0 },
      { label: "5 и больше", customers: 0 },
    ]);
  });

  it("reports no median when nobody has returned", () => {
    const result = buildRepeat([seen("0555111111", "2026-09-10T06:00:00Z")], [], "2026-09-10", "2026-09-16");
    expect(result).toMatchObject({ cohort: 1, returned: 0, medianDaysToSecond: null });
  });
});

describe("buildFavorites", () => {
  it("lists the most favorited published products next to what they sold", () => {
    const catalogue = buildCatalogueIndex(
      [product({ id: 1 }), product({ id: 2 }), product({ id: 3, published: false })],
      [],
      [],
    );
    const result = buildFavorites(
      new Map([
        [1, 4],
        [2, 9],
        [3, 20],
      ]),
      catalogue,
      new Map([[1, 6]]),
    );
    expect(result).toEqual([
      { id: 2, name: "Товар 2", favorites: 9, sold: 0 },
      { id: 1, name: "Товар 1", favorites: 4, sold: 6 },
    ]);
  });
});

describe("buildUnsold", () => {
  const catalogue: Map<number, ProductMeta> = buildCatalogueIndex(
    [
      product({ id: 1, purchase_count: 30 }),
      product({ id: 2, purchase_count: 0 }),
      product({ id: 3, purchase_count: 5 }),
      product({ id: 4, purchase_count: 0, published: false }),
      product({ id: 5, purchase_count: 0, created_at: "2026-09-12T00:00:00Z" }),
    ],
    [],
    [],
  );

  it("separates never-sold from stalled, and does not blame products added mid-period", () => {
    const result = buildUnsold(catalogue, new Map([[3, 1]]), "2026-09-10");
    expect(result).toEqual({ total: 2, neverSold: 1, stalled: [{ id: 1, name: "Товар 1", purchaseCount: 30 }] });
  });

  it("counts every published product over all time", () => {
    expect(buildUnsold(catalogue, new Map(), null).total).toBe(4);
  });
});

describe("buildInsights", () => {
  it("keeps cancelled orders out of sales-based sections but in the cancellation one", () => {
    const catalogue = buildCatalogueIndex([product({ id: 1 }), product({ id: 2 })], [], []);
    const rows = [
      order({ id: 1, items: [item(1, 1000)] }),
      order({ id: 2, status: "cancelled", items: [item(2, 1000)] }),
    ];
    const insights = buildInsights({
      rows,
      fromDay: "2026-09-10",
      toDay: "2026-09-16",
      includeCancelled: false,
      history: [],
      catalogue,
      favoriteCounts: new Map(),
    });

    expect(insights.categories).toEqual([{ id: null, name: "Без категории", quantity: 1, revenue: 1000 }]);
    expect(insights.cancellations).toMatchObject({ total: 2, cancelled: 1 });
    // Product 2 only appears in a cancelled order, so it did not sell.
    expect(insights.unsold.total).toBe(1);
  });
});
