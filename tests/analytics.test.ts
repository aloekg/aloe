import { describe, expect, it } from "vitest";
import {
  addDays,
  bucketLabel,
  bucketOf,
  buildReport,
  customerKey,
  firstOrderDays,
  granularityFor,
  parsePeriod,
  periodRange,
  shopDay,
  shopDayStart,
  type AnalyticsOrderRow,
} from "@/lib/analytics";
import type { OrderItem } from "@/types";

function item(id: number, price: number, quantity = 1, name = `Товар ${id}`): OrderItem {
  return { id, name, price, quantity, image_url: "" };
}

function order(overrides: Partial<AnalyticsOrderRow> & Pick<AnalyticsOrderRow, "created_at">): AnalyticsOrderRow {
  return {
    id: 1,
    user_id: null,
    customer_phone: "+996555000001",
    total: 1000,
    delivery_cost: 200,
    delivery_type: "center",
    status: "new",
    items: [item(1, 800)],
    ...overrides,
  };
}

const NO_HISTORY = new Map<string, string>();
const NO_CATEGORIES = new Map<number, { id: number; name: string }>();

describe("shop days", () => {
  it("buckets an order by Bishkek's day, not UTC's", () => {
    // 19:00 UTC is already 01:00 the next morning in Bishkek (+6).
    expect(shopDay("2026-09-17T19:00:00Z")).toBe("2026-09-18");
    expect(shopDay("2026-09-17T17:59:00Z")).toBe("2026-09-17");
  });

  it("starts a day at local midnight, i.e. 18:00 UTC the day before", () => {
    expect(shopDayStart("2026-09-18").toISOString()).toBe("2026-09-17T18:00:00.000Z");
  });

  it("walks the calendar across month and year ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });
});

describe("periods", () => {
  it("falls back to the default for anything unrecognised", () => {
    expect(parsePeriod("90")).toBe("90");
    expect(parsePeriod("нет")).toBe("30");
    expect(parsePeriod(undefined)).toBe("30");
  });

  it("counts whole shop days ending with today", () => {
    const now = new Date("2026-09-17T09:00:00Z");
    expect(periodRange("7", now)).toEqual({ fromDay: "2026-09-11", toDay: "2026-09-17" });
    expect(periodRange("all", now)).toEqual({ fromDay: null, toDay: "2026-09-17" });
  });

  it("widens the bucket as the range grows, so a year is not 365 bars", () => {
    expect(granularityFor("2026-09-01", "2026-09-30")).toBe("day");
    expect(granularityFor("2026-06-01", "2026-09-30")).toBe("week");
    expect(granularityFor("2025-09-01", "2026-09-30")).toBe("month");
  });

  it("groups a week from its Monday", () => {
    // 2026-09-17 is a Thursday.
    expect(bucketOf("2026-09-17", "week")).toBe("2026-09-14");
    expect(bucketOf("2026-09-14", "week")).toBe("2026-09-14");
    // Sunday belongs to the week that started six days earlier, not to the next one.
    expect(bucketOf("2026-09-20", "week")).toBe("2026-09-14");
    expect(bucketLabel("2026-09-14", "week")).toBe("14–20.09");
    // A week that straddles two months has to name both.
    expect(bucketLabel("2026-09-28", "week")).toBe("28.09–4.10");
    expect(bucketLabel("2026-09-17", "day")).toBe("17.09");
    expect(bucketLabel("2026-09", "month")).toBe("сен 2026");
  });
});

describe("customerKey", () => {
  it("treats +996 555 … and 0555 … as the same person", () => {
    expect(customerKey({ user_id: null, customer_phone: "+996 555 123456" })).toBe(
      customerKey({ user_id: "abc", customer_phone: "0555 123 456" }),
    );
  });

  it("falls back to the account when the phone is unusable", () => {
    expect(customerKey({ user_id: "abc", customer_phone: null })).toBe("u:abc");
    expect(customerKey({ user_id: null, customer_phone: null })).toBe("");
  });
});

describe("firstOrderDays", () => {
  it("keeps the earliest order per customer, whatever order the rows arrive in", () => {
    const first = firstOrderDays([
      { user_id: null, customer_phone: "0555123456", created_at: "2026-09-10T06:00:00Z" },
      { user_id: null, customer_phone: "+996555123456", created_at: "2025-03-01T06:00:00Z" },
      { user_id: null, customer_phone: null, created_at: "2026-09-10T06:00:00Z" },
    ]);
    expect(first.get("p:555123456")).toBe("2025-03-01");
    expect(first.size).toBe(1);
  });
});

describe("buildReport", () => {
  const base = {
    fromDay: "2026-09-15",
    toDay: "2026-09-17",
    firstOrderByCustomer: NO_HISTORY,
    categoryOf: NO_CATEGORIES,
  };

  it("leaves cancelled orders out of the money unless asked, but always out of nothing else", () => {
    const rows = [
      order({ id: 1, created_at: "2026-09-15T06:00:00Z", total: 1000 }),
      order({ id: 2, created_at: "2026-09-16T06:00:00Z", total: 500, status: "cancelled" }),
    ];

    const without = buildReport({ ...base, rows, includeCancelled: false });
    expect(without.revenue).toBe(1000);
    expect(without.orders).toBe(1);
    // The status breakdown is the one place a cancelled order must still show up.
    expect(without.statuses.find((s) => s.id === "cancelled")).toEqual({ id: "cancelled", orders: 1, revenue: 500 });

    const with_ = buildReport({ ...base, rows, includeCancelled: true });
    expect(with_.revenue).toBe(1500);
    expect(with_.orders).toBe(2);
  });

  it("splits the total into goods and delivery, and averages over the counted orders", () => {
    const rows = [
      order({ id: 1, created_at: "2026-09-15T06:00:00Z", total: 1200, delivery_cost: 200 }),
      order({ id: 2, created_at: "2026-09-16T06:00:00Z", total: 800, delivery_cost: 0 }),
    ];
    const report = buildReport({ ...base, rows, includeCancelled: false });
    expect(report.revenue).toBe(2000);
    expect(report.deliveryRevenue).toBe(200);
    expect(report.goodsRevenue).toBe(1800);
    expect(report.averageOrder).toBe(1000);
  });

  it("emits a point per bucket across the whole window, including empty days", () => {
    const rows = [order({ id: 1, created_at: "2026-09-17T06:00:00Z", total: 700 })];
    const report = buildReport({ ...base, rows, includeCancelled: false });
    expect(report.series.map((p) => p.bucket)).toEqual(["2026-09-15", "2026-09-16", "2026-09-17"]);
    expect(report.series.map((p) => p.revenue)).toEqual([0, 0, 700]);
    expect(report.series.at(-1)?.orders).toBe(1);
  });

  it("ranks products and categories by revenue, folding repeat sales together", () => {
    const rows = [
      order({ id: 1, created_at: "2026-09-15T06:00:00Z", items: [item(10, 100, 2), item(20, 500)] }),
      order({ id: 2, created_at: "2026-09-16T06:00:00Z", items: [item(10, 100, 3)] }),
    ];
    const categoryOf = new Map([
      [10, { id: 1, name: "Уборка" }],
      [20, { id: 2, name: "Стирка" }],
    ]);
    const report = buildReport({ ...base, rows, includeCancelled: false, categoryOf });

    expect(report.itemsSold).toBe(6);
    expect(report.topProducts[0]).toMatchObject({ id: 10, quantity: 5, revenue: 500 });
    expect(report.topProducts[1]).toMatchObject({ id: 20, quantity: 1, revenue: 500 });
    expect(report.categories.map((c) => c.name)).toEqual(["Уборка", "Стирка"]);
  });

  it("files a product with no known category under Без категории", () => {
    const rows = [order({ id: 1, created_at: "2026-09-15T06:00:00Z", items: [item(99, 300)] })];
    const report = buildReport({ ...base, rows, includeCancelled: false });
    expect(report.categories).toEqual([{ id: null, name: "Без категории", quantity: 1, revenue: 300 }]);
  });

  it("counts free delivery only where the tariff could have charged for it", () => {
    const rows = [
      // Free because the basket cleared the threshold.
      order({ id: 1, created_at: "2026-09-15T06:00:00Z", delivery_type: "center", delivery_cost: 0 }),
      order({ id: 2, created_at: "2026-09-15T07:00:00Z", delivery_type: "center", delivery_cost: 200 }),
      // Zero because the fee is agreed by phone / paid to the courier — neither is "бесплатно".
      order({ id: 3, created_at: "2026-09-16T06:00:00Z", delivery_type: "regions", delivery_cost: 0 }),
      order({ id: 4, created_at: "2026-09-16T07:00:00Z", delivery_type: "urgent", delivery_cost: 0 }),
    ];
    const report = buildReport({ ...base, rows, includeCancelled: false });
    expect(report.freeDelivery).toEqual({ free: 1, ofZoned: 2 });
    expect(report.delivery.find((d) => d.id === "regions")?.orders).toBe(1);
  });

  it("labels an unrecognised delivery type rather than dropping the order", () => {
    const rows = [order({ id: 1, created_at: "2026-09-15T06:00:00Z", delivery_type: null })];
    const report = buildReport({ ...base, rows, includeCancelled: false });
    expect(report.delivery).toEqual([{ id: "unknown", label: "Не указана", orders: 1, revenue: 200 }]);
  });

  it("calls a customer new only when their first order ever falls inside the period", () => {
    const rows = [
      order({ id: 1, created_at: "2026-09-15T06:00:00Z", customer_phone: "0555111111" }),
      order({ id: 2, created_at: "2026-09-16T06:00:00Z", customer_phone: "0555111111" }),
      order({ id: 3, created_at: "2026-09-16T07:00:00Z", customer_phone: "0555222222", user_id: "u1" }),
    ];
    const report = buildReport({
      ...base,
      rows,
      includeCancelled: false,
      // 555111111 has been ordering since March; 555222222 is here for the first time.
      firstOrderByCustomer: new Map([["p:555111111", "2026-03-01"]]),
    });

    expect(report.customers.total).toBe(2);
    expect(report.customers.fresh).toBe(1);
    expect(report.customers.returning).toBe(1);
    expect(report.customers.guestOrders).toBe(2);
    expect(report.customers.ordersPer).toBe(1.5);
  });

  it("reports zeroes rather than NaN for a period with no orders", () => {
    const report = buildReport({ ...base, rows: [], includeCancelled: false });
    expect(report.averageOrder).toBe(0);
    expect(report.customers.ordersPer).toBe(0);
    expect(report.series).toHaveLength(3);
  });
});
