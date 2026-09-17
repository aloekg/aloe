import { DELIVERY_OPTIONS } from "@/lib/constants";
import type { OrderItem } from "@/types";

/**
 * Sales analytics, computed in JS from `orders` rather than in SQL.
 *
 * Everything here is pure: the page hands it rows and this module hands back the numbers the
 * dashboard renders, so the arithmetic is exercised by tests/analytics.test.ts with no database.
 * That is also why the aggregation is not an RPC — a Postgres function would need a migration
 * pushed to both projects to change a single formula, and the shop's order volume is small enough
 * that a bounded range of rows is cheaper than the schema churn. `loadAnalyticsOrders` caps the
 * fetch; if that cap is ever hit in earnest, this is the module to move into SQL.
 */

/**
 * The shop is in Bishkek, `orders.created_at` is timestamptz, and a day on this dashboard has to
 * be the shop's day — bucketing in UTC moves every order placed after 18:00 local into tomorrow.
 */
export const SHOP_TIME_ZONE = "Asia/Bishkek";

export const ANALYTICS_PERIODS = [
  { id: "7", label: "7 дней", days: 7 },
  { id: "30", label: "30 дней", days: 30 },
  { id: "90", label: "90 дней", days: 90 },
  { id: "365", label: "Год", days: 365 },
  { id: "all", label: "Всё время", days: null },
] as const;

export type PeriodId = (typeof ANALYTICS_PERIODS)[number]["id"];

export const DEFAULT_PERIOD: PeriodId = "30";

export function parsePeriod(raw: string | undefined): PeriodId {
  const match = ANALYTICS_PERIODS.find((p) => p.id === raw);
  return match ? match.id : DEFAULT_PERIOD;
}

// ---------------------------------------------------------------------------
// Calendar helpers — all of them work on "YYYY-MM-DD" shop days, never on local
// Date fields, which are the server's timezone (UTC on Vercel) and not the shop's.
// ---------------------------------------------------------------------------

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHOP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The shop-local calendar day an instant falls on, as "YYYY-MM-DD". */
export function shopDay(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return DAY_KEY.format(date);
}

const ZONE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** How far ahead of UTC the shop's clock runs at that instant (Asia/Bishkek: a flat +6, no DST). */
function zoneOffsetMs(at: Date): number {
  const parts = Object.fromEntries(ZONE_PARTS.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - at.getTime();
}

/** The instant a shop day begins, i.e. what to send Postgres as the range bound. */
export function shopDayStart(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const utcMidnight = Date.UTC(year, month - 1, date);
  return new Date(utcMidnight - zoneOffsetMs(new Date(utcMidnight)));
}

/** Calendar arithmetic on a day key — `delta` days later (or earlier, when negative). */
export function addDays(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + delta));
  return moved.toISOString().slice(0, 10);
}

/**
 * The window a period covers, as shop days. `from` is null for "all time" — the caller then starts
 * the series at the first order it actually got back rather than at an arbitrary date.
 */
export function periodRange(period: PeriodId, now: Date = new Date()): { fromDay: string | null; toDay: string } {
  const toDay = shopDay(now);
  const days = ANALYTICS_PERIODS.find((p) => p.id === period)?.days ?? null;
  // `days` counts whole shop days ending with today, so 7 дней is today plus the six before it.
  return { fromDay: days ? addDays(toDay, -(days - 1)) : null, toDay };
}

export type Granularity = "day" | "week" | "month";

/**
 * One bar per day stops being readable long before a year of them fits on screen, so a long range
 * is bucketed instead of squeezed.
 */
export function granularityFor(fromDay: string, toDay: string): Granularity {
  const span = Math.round((shopDayStart(toDay).getTime() - shopDayStart(fromDay).getTime()) / 86_400_000) + 1;
  if (span <= 45) return "day";
  if (span <= 240) return "week";
  return "month";
}

/** Monday of the week a day falls in. */
function weekStart(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  // getUTCDay(): 0 = Sunday, which is the *last* day of the week here, not the first.
  const shift = (utc.getUTCDay() + 6) % 7;
  return addDays(day, -shift);
}

export function bucketOf(day: string, granularity: Granularity): string {
  if (granularity === "day") return day;
  if (granularity === "week") return weekStart(day);
  return day.slice(0, 7);
}

/** The next bucket after this one — used to walk a range without skipping empty buckets. */
function nextBucket(bucket: string, granularity: Granularity): string {
  if (granularity === "day") return addDays(bucket, 1);
  if (granularity === "week") return addDays(bucket, 7);
  const [year, month] = bucket.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
}

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export function bucketLabel(bucket: string, granularity: Granularity): string {
  if (granularity === "month") {
    const [year, month] = bucket.split("-").map(Number);
    return `${MONTHS[month - 1]} ${year}`;
  }
  const [, month, date] = bucket.split("-").map(Number);
  const dotted = (d: number, m: number) => `${d}.${String(m).padStart(2, "0")}`;
  if (granularity === "day") return dotted(date, month);
  const [, endMonth, endDate] = addDays(bucket, 6).split("-").map(Number);
  // A week inside one month needs the month named once; one that straddles two needs it twice.
  const start = endMonth === month ? String(date) : dotted(date, month);
  return `${start}–${dotted(endDate, endMonth)}`;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/** The columns the dashboard reads. Deliberately not `Order` — `items` is the expensive part. */
export type AnalyticsOrderRow = {
  id: number;
  user_id: string | null;
  customer_phone: string | null;
  total: number;
  delivery_cost: number;
  delivery_type: string | null;
  status: string;
  created_at: string;
  items: OrderItem[];
};

/** Just enough of an order to tell a returning customer from a new one. */
export type CustomerSeenRow = Pick<AnalyticsOrderRow, "user_id" | "customer_phone" | "created_at">;

export type SeriesPoint = { bucket: string; label: string; revenue: number; orders: number };
export type TopProduct = { id: number; name: string; quantity: number; revenue: number };
export type CategoryStat = { id: number | null; name: string; quantity: number; revenue: number };
export type DeliveryStat = { id: string; label: string; orders: number; revenue: number };
export type StatusStat = { id: string; orders: number; revenue: number };

export type AnalyticsReport = {
  /** Everything below counts the same set of orders: the period's, cancelled ones included or not. */
  revenue: number;
  goodsRevenue: number;
  deliveryRevenue: number;
  orders: number;
  averageOrder: number;
  itemsSold: number;
  granularity: Granularity;
  series: SeriesPoint[];
  topProducts: TopProduct[];
  categories: CategoryStat[];
  delivery: DeliveryStat[];
  /** Always over every order in the period, cancelled included — that is the point of the breakdown. */
  statuses: StatusStat[];
  freeDelivery: { free: number; ofZoned: number };
  customers: { total: number; fresh: number; returning: number; guestOrders: number; ordersPer: number };
};

export const TOP_PRODUCTS_LIMIT = 10;
export const TOP_CATEGORIES_LIMIT = 8;

/**
 * Who placed an order. Phone first and `user_id` only as a fallback: the same person orders once
 * as a guest and once signed in, and counting that as two customers would inflate "новые" forever.
 * Kyrgyz numbers are written both as +996 555 … and 0555 …, so only the last nine digits are
 * compared.
 */
export function customerKey(row: { user_id: string | null; customer_phone: string | null }): string {
  const digits = (row.customer_phone ?? "").replace(/\D/g, "");
  if (digits.length >= 9) return `p:${digits.slice(-9)}`;
  if (row.user_id) return `u:${row.user_id}`;
  return digits ? `p:${digits}` : "";
}

/** First order per customer across all of history — a customer is "new" only on their own first. */
export function firstOrderDays(rows: CustomerSeenRow[]): Map<string, string> {
  const first = new Map<string, string>();
  for (const row of rows) {
    const key = customerKey(row);
    if (!key) continue;
    const day = shopDay(row.created_at);
    const seen = first.get(key);
    if (!seen || day < seen) first.set(key, day);
  }
  return first;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export type ReportInput = {
  rows: AnalyticsOrderRow[];
  fromDay: string | null;
  toDay: string;
  /** A cancelled order is a booking that never happened, so it is out of the money by default. */
  includeCancelled: boolean;
  firstOrderByCustomer: Map<string, string>;
  /** Product id → the top-level category it rolls up to. Missing ids land in "Без категории". */
  categoryOf: Map<number, { id: number; name: string }>;
};

export function buildReport({
  rows,
  fromDay,
  toDay,
  includeCancelled,
  firstOrderByCustomer,
  categoryOf,
}: ReportInput): AnalyticsReport {
  const counted = includeCancelled ? rows : rows.filter((r) => r.status !== "cancelled");

  let revenue = 0;
  let deliveryRevenue = 0;
  let itemsSold = 0;
  let free = 0;
  let ofZoned = 0;
  let guestOrders = 0;

  const byBucket = new Map<string, { revenue: number; orders: number }>();
  const byProduct = new Map<number, TopProduct>();
  const byCategory = new Map<number | null, CategoryStat>();
  const byDelivery = new Map<string, DeliveryStat>();
  const byStatus = new Map<string, StatusStat>();
  const ordersByCustomer = new Map<string, number>();

  // The series has to span the whole window even where nothing sold, so its first bucket comes from
  // the period, or — for "всё время" — from the oldest order there actually is.
  const firstDay =
    fromDay ??
    counted.reduce<string | null>((min, r) => {
      const day = shopDay(r.created_at);
      return !min || day < min ? day : min;
    }, null) ??
    toDay;
  const granularity = granularityFor(firstDay, toDay);

  for (const row of rows) {
    const status = byStatus.get(row.status) ?? { id: row.status, orders: 0, revenue: 0 };
    status.orders += 1;
    status.revenue += row.total;
    byStatus.set(row.status, status);
  }

  for (const row of counted) {
    revenue += row.total;
    deliveryRevenue += row.delivery_cost;
    if (!row.user_id) guestOrders += 1;

    const bucket = bucketOf(shopDay(row.created_at), granularity);
    const point = byBucket.get(bucket) ?? { revenue: 0, orders: 0 };
    point.revenue += row.total;
    point.orders += 1;
    byBucket.set(bucket, point);

    const zone = DELIVERY_OPTIONS.find((o) => o.id === row.delivery_type);
    const deliveryId = zone?.id ?? "unknown";
    const delivery = byDelivery.get(deliveryId) ?? {
      id: deliveryId,
      label: zone ? zone.label : "Не указана",
      orders: 0,
      revenue: 0,
    };
    delivery.orders += 1;
    delivery.revenue += row.delivery_cost;
    byDelivery.set(deliveryId, delivery);

    // A zero fee only means "бесплатно" where the tariff could have charged one: "regions" is
    // agreed by phone and "urgent" is paid to the courier, so neither says anything about free
    // delivery and both stay out of the ratio.
    if (zone && zone.cost > 0) {
      ofZoned += 1;
      if (row.delivery_cost === 0) free += 1;
    }

    const key = customerKey(row);
    if (key) ordersByCustomer.set(key, (ordersByCustomer.get(key) ?? 0) + 1);

    for (const item of row.items ?? []) {
      const lineRevenue = item.price * item.quantity;
      itemsSold += item.quantity;

      const product = byProduct.get(item.id) ?? { id: item.id, name: item.name, quantity: 0, revenue: 0 };
      product.quantity += item.quantity;
      product.revenue += lineRevenue;
      // The name is frozen per order, so a renamed product shows up under its latest sale's name.
      product.name = item.name;
      byProduct.set(item.id, product);

      const category = categoryOf.get(item.id) ?? null;
      const categoryId = category?.id ?? null;
      const stat = byCategory.get(categoryId) ?? {
        id: categoryId,
        name: category?.name ?? "Без категории",
        quantity: 0,
        revenue: 0,
      };
      stat.quantity += item.quantity;
      stat.revenue += lineRevenue;
      byCategory.set(categoryId, stat);
    }
  }

  const series: SeriesPoint[] = [];
  for (
    let bucket = bucketOf(firstDay, granularity), last = bucketOf(toDay, granularity);
    bucket <= last;
    bucket = nextBucket(bucket, granularity)
  ) {
    const point = byBucket.get(bucket);
    series.push({
      bucket,
      label: bucketLabel(bucket, granularity),
      revenue: round(point?.revenue ?? 0),
      orders: point?.orders ?? 0,
    });
  }

  let fresh = 0;
  for (const key of ordersByCustomer.keys()) {
    const first = firstOrderByCustomer.get(key);
    // No history for the key means this period holds their first order too.
    if (!first || first >= firstDay) fresh += 1;
  }

  const orders = counted.length;
  return {
    revenue: round(revenue),
    goodsRevenue: round(revenue - deliveryRevenue),
    deliveryRevenue: round(deliveryRevenue),
    orders,
    averageOrder: orders ? round(revenue / orders) : 0,
    itemsSold,
    granularity,
    series,
    topProducts: [...byProduct.values()]
      .map((p) => ({ ...p, revenue: round(p.revenue) }))
      .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
      .slice(0, TOP_PRODUCTS_LIMIT),
    categories: [...byCategory.values()]
      .map((c) => ({ ...c, revenue: round(c.revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, TOP_CATEGORIES_LIMIT),
    delivery: [...byDelivery.values()].sort((a, b) => b.orders - a.orders),
    statuses: [...byStatus.values()].map((s) => ({ ...s, revenue: round(s.revenue) })),
    freeDelivery: { free, ofZoned },
    customers: {
      total: ordersByCustomer.size,
      fresh,
      returning: ordersByCustomer.size - fresh,
      guestOrders,
      ordersPer: ordersByCustomer.size ? round(orders / ordersByCustomer.size) : 0,
    },
  };
}
