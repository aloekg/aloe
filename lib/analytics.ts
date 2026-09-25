import { DELIVERY_OPTIONS } from "@/lib/constants";
import type { OrderItem } from "@/types";

// Keep this module pure (no DB): tests/analytics.test.ts exercises it directly.

// Days are shop days; bucketing in UTC would move evening orders into tomorrow.
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

// Work on "YYYY-MM-DD" shop-day keys, never on local Date fields (the server runs in UTC).
const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHOP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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

export function shopDayStart(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const utcMidnight = Date.UTC(year, month - 1, date);
  return new Date(utcMidnight - zoneOffsetMs(new Date(utcMidnight)));
}

export function shopHour(value: string | Date): number {
  const date = typeof value === "string" ? new Date(value) : value;
  const hour = ZONE_PARTS.formatToParts(date).find((p) => p.type === "hour")?.value;
  return Number(hour);
}

// Monday = 0 … Sunday = 6, not JavaScript's Sunday-first.
export function weekdayOf(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
}

export function addDays(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + delta));
  return moved.toISOString().slice(0, 10);
}

export function periodRange(period: PeriodId, now: Date = new Date()): { fromDay: string | null; toDay: string } {
  const toDay = shopDay(now);
  const days = ANALYTICS_PERIODS.find((p) => p.id === period)?.days ?? null;
  return { fromDay: days ? addDays(toDay, -(days - 1)) : null, toDay };
}

export type Granularity = "day" | "week" | "month";

export function granularityFor(fromDay: string, toDay: string): Granularity {
  const span = Math.round((shopDayStart(toDay).getTime() - shopDayStart(fromDay).getTime()) / 86_400_000) + 1;
  if (span <= 45) return "day";
  if (span <= 240) return "week";
  return "month";
}

function weekStart(day: string): string {
  return addDays(day, -weekdayOf(day));
}

export function bucketOf(day: string, granularity: Granularity): string {
  if (granularity === "day") return day;
  if (granularity === "week") return weekStart(day);
  return day.slice(0, 7);
}

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
  const start = endMonth === month ? String(date) : dotted(date, month);
  return `${start}–${dotted(endDate, endMonth)}`;
}

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

export type CustomerSeenRow = Pick<AnalyticsOrderRow, "user_id" | "customer_phone" | "created_at" | "status">;

export type SeriesPoint = { bucket: string; label: string; revenue: number; orders: number };
export type TopProduct = { id: number; name: string; quantity: number; revenue: number };
export type DeliveryStat = { id: string; label: string; orders: number; revenue: number };
export type StatusStat = { id: string; orders: number; revenue: number };

export type AnalyticsReport = {
  revenue: number;
  goodsRevenue: number;
  deliveryRevenue: number;
  orders: number;
  averageOrder: number;
  itemsSold: number;
  granularity: Granularity;
  series: SeriesPoint[];
  topProducts: TopProduct[];
  delivery: DeliveryStat[];
  // Always over every order in the period, cancelled included.
  statuses: StatusStat[];
  freeDelivery: { free: number; ofZoned: number };
  customers: { total: number; fresh: number; returning: number; guestOrders: number; ordersPer: number };
};

export const TOP_PRODUCTS_LIMIT = 10;

// Phone (last 9 digits) before user_id: one person's guest and signed-in orders must count once.
export function customerKey(row: { user_id: string | null; customer_phone: string | null }): string {
  const digits = (row.customer_phone ?? "").replace(/\D/g, "");
  if (digits.length >= 9) return `p:${digits.slice(-9)}`;
  if (row.user_id) return `u:${row.user_id}`;
  return digits ? `p:${digits}` : "";
}

export function firstOrderDays(rows: CustomerSeenRow[]): Map<string, string> {
  const first = new Map<string, string>();
  for (const row of rows) {
    if (row.status === "cancelled") continue;
    const key = customerKey(row);
    if (!key) continue;
    const day = shopDay(row.created_at);
    const seen = first.get(key);
    if (!seen || day < seen) first.set(key, day);
  }
  return first;
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export type ReportInput = {
  rows: AnalyticsOrderRow[];
  fromDay: string | null;
  toDay: string;
  includeCancelled: boolean;
  firstOrderByCustomer: Map<string, string>;
};

export function countedOrders(rows: AnalyticsOrderRow[], includeCancelled: boolean): AnalyticsOrderRow[] {
  return includeCancelled ? rows : rows.filter((r) => r.status !== "cancelled");
}

export function windowStart(fromDay: string | null, counted: AnalyticsOrderRow[], toDay: string): string {
  if (fromDay) return fromDay;
  let min: string | null = null;
  for (const row of counted) {
    const day = shopDay(row.created_at);
    if (!min || day < min) min = day;
  }
  return min ?? toDay;
}

export type PeriodSummary = { revenue: number; orders: number; averageOrder: number; customers: number };

export function summarizePeriod(rows: AnalyticsOrderRow[], includeCancelled: boolean): PeriodSummary {
  const counted = countedOrders(rows, includeCancelled);
  const revenue = counted.reduce((sum, row) => sum + row.total, 0);
  const customers = new Set(counted.map(customerKey).filter(Boolean)).size;
  return {
    revenue: round(revenue),
    orders: counted.length,
    averageOrder: counted.length ? round(revenue / counted.length) : 0,
    customers,
  };
}

export function previousRange(period: PeriodId, fromDay: string | null): { fromDay: string; toDay: string } | null {
  const days = ANALYTICS_PERIODS.find((p) => p.id === period)?.days ?? null;
  if (!days || !fromDay) return null;
  return { fromDay: addDays(fromDay, -days), toDay: addDays(fromDay, -1) };
}

export function buildReport({
  rows,
  fromDay,
  toDay,
  includeCancelled,
  firstOrderByCustomer,
}: ReportInput): AnalyticsReport {
  const counted = countedOrders(rows, includeCancelled);

  let revenue = 0;
  let deliveryRevenue = 0;
  let itemsSold = 0;
  let free = 0;
  let ofZoned = 0;
  let guestOrders = 0;

  const byBucket = new Map<string, { revenue: number; orders: number }>();
  const byProduct = new Map<number, TopProduct>();
  const byDelivery = new Map<string, DeliveryStat>();
  const byStatus = new Map<string, StatusStat>();
  const ordersByCustomer = new Map<string, number>();

  const firstDay = windowStart(fromDay, counted, toDay);
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

    // Only zones with a tariff count toward free delivery: a zero fee on regions/urgent means nothing.
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
      product.name = item.name;
      byProduct.set(item.id, product);
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
