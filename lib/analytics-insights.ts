import type { AnalyticsOrderRow, CustomerSeenRow } from "@/lib/analytics";
import {
  countedOrders,
  customerKey,
  round,
  shopDay,
  shopDayStart,
  shopHour,
  weekdayOf,
  windowStart,
} from "@/lib/analytics";
import { DELIVERY_OPTIONS, FREE_DELIVERY_THRESHOLD } from "@/lib/constants";

/**
 * The dashboard's second tier: everything that needs more than the period's orders — the catalogue
 * (categories, brands, promo labels, what did not sell), the whole order history (repeat purchases)
 * or favorites. Kept apart from `buildReport` so the core numbers stay readable, and pure for the
 * same reason as `lib/analytics.ts`: tests/analytics-insights.test.ts runs it with no database.
 */

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

/** What `loadCatalogue` selects per product. */
export type CatalogueProductRow = {
  id: number;
  name: string;
  price: number;
  old_price: number | null;
  label: string | null;
  brand_id: number | null;
  category_id: number | null;
  published: boolean;
  purchase_count: number;
  created_at: string | null;
};

export type CatalogueCategoryRow = { id: number; name: string; parent_id: number | null };
export type CatalogueBrandRow = { id: number; name: string };

export type ProductMeta = {
  id: number;
  name: string;
  published: boolean;
  purchaseCount: number;
  createdAt: string | null;
  /** On promotion *now* — `orders.items` freezes the price paid but not whether it was a sale price. */
  promo: boolean;
  /** The top-level category, however deep the product actually hangs. */
  category: { id: number; name: string } | null;
  brand: { id: number; name: string } | null;
};

export function buildCatalogueIndex(
  products: CatalogueProductRow[],
  categories: CatalogueCategoryRow[],
  brands: CatalogueBrandRow[],
): Map<number, ProductMeta> {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const brandById = new Map(brands.map((b) => [b.id, b]));

  // The same two hops the storefront walks: a product may sit on a subcategory or a
  // sub-subcategory, and neither is what a sales breakdown wants to list.
  const topLevelOf = (categoryId: number | null) => {
    let current = categoryId == null ? undefined : categoryById.get(categoryId);
    for (let hop = 0; hop < 2 && current?.parent_id != null; hop += 1) current = categoryById.get(current.parent_id);
    return current ? { id: current.id, name: current.name } : null;
  };

  const index = new Map<number, ProductMeta>();
  for (const p of products) {
    const brand = p.brand_id == null ? undefined : brandById.get(p.brand_id);
    index.set(p.id, {
      id: p.id,
      name: p.name,
      published: p.published,
      purchaseCount: p.purchase_count,
      createdAt: p.created_at,
      promo: p.label === "sale" || (p.old_price != null && p.old_price > p.price),
      category: topLevelOf(p.category_id),
      brand: brand ? { id: brand.id, name: brand.name } : null,
    });
  }
  return index;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export type NamedStat = { id: number | null; name: string; quantity: number; revenue: number };

export type HeatmapInsight = {
  /** [weekday: Monday = 0][hour 0–23] → orders. */
  cells: number[][];
  max: number;
  peak: { weekday: number; hour: number; orders: number } | null;
};

export type PromoInsight = {
  /** Goods only — delivery is not something a promotion sells. */
  goodsRevenue: number;
  promoRevenue: number;
  promoQuantity: number;
  /** Distinct promo products that sold in the period, out of how many are on promotion now. */
  soldProducts: number;
  catalogueProducts: number;
};

export type ThresholdBin = { from: number; to: number | null; orders: number };

export type ThresholdInsight = {
  threshold: number;
  /** Orders in the zones where the threshold actually waives the fee — the only ones it can move. */
  orders: number;
  bins: ThresholdBin[];
  /** Within `NEAR` сом under the threshold: they paid for delivery by a small margin. */
  nearMiss: number;
  /** Within `NEAR` сом over it: the baskets most plausibly topped up to get it free. */
  justOver: number;
  near: number;
};

export type CancellationInsight = {
  total: number;
  cancelled: number;
  byZone: Array<{ id: string; orders: number; cancelled: number }>;
  byProduct: Array<{ id: number; name: string; orders: number; cancelled: number }>;
};

export type RepeatInsight = {
  /** Customers whose first order ever falls in the period. */
  cohort: number;
  /** …of whom this many have ordered again since — at any time up to now. */
  returned: number;
  medianDaysToSecond: number | null;
  /** Customers active in the period, by how many orders they have placed in their whole history. */
  lifetime: Array<{ label: string; customers: number }>;
};

export type FavoriteInsight = { id: number; name: string; favorites: number; sold: number };

export type UnsoldInsight = {
  /** Published products with no sale in the period (those added during it are not held against it). */
  total: number;
  neverSold: number;
  /** Sold before, silent now — the likelier sign that something changed. Highest lifetime count first. */
  stalled: Array<{ id: number; name: string; purchaseCount: number }>;
};

export type AnalyticsInsights = {
  categories: NamedStat[];
  brands: NamedStat[];
  heatmap: HeatmapInsight;
  promo: PromoInsight;
  threshold: ThresholdInsight;
  cancellations: CancellationInsight;
  repeat: RepeatInsight;
  favorites: FavoriteInsight[];
  unsold: UnsoldInsight;
};

export const TOP_NAMED_LIMIT = 8;
export const LIST_LIMIT = 10;
const THRESHOLD_STEP = 1000;
const THRESHOLD_NEAR = 2000;
/** One product in one cancelled order is an anecdote, not a pattern — it would top the list at 100%. */
const MIN_ORDERS_FOR_CANCEL_RATE = 2;

export type InsightsInput = {
  /** Every order in the period, cancelled included — the cancellation breakdown needs them all. */
  rows: AnalyticsOrderRow[];
  fromDay: string | null;
  toDay: string;
  includeCancelled: boolean;
  history: CustomerSeenRow[];
  catalogue: Map<number, ProductMeta>;
  favoriteCounts: Map<number, number>;
};

export function buildInsights(input: InsightsInput): AnalyticsInsights {
  const counted = countedOrders(input.rows, input.includeCancelled);
  const firstDay = windowStart(input.fromDay, counted, input.toDay);
  const sold = soldQuantities(counted);

  return {
    ...namedBreakdowns(counted, input.catalogue),
    heatmap: buildHeatmap(counted),
    promo: buildPromo(counted, input.catalogue),
    threshold: buildThreshold(counted),
    cancellations: buildCancellations(input.rows),
    repeat: buildRepeat(input.history, counted, firstDay, input.toDay),
    favorites: buildFavorites(input.favoriteCounts, input.catalogue, sold),
    unsold: buildUnsold(input.catalogue, sold, input.fromDay ? firstDay : null),
  };
}

function soldQuantities(rows: AnalyticsOrderRow[]): Map<number, number> {
  const sold = new Map<number, number>();
  for (const row of rows)
    for (const item of row.items ?? []) sold.set(item.id, (sold.get(item.id) ?? 0) + item.quantity);
  return sold;
}

function sortNamed(stats: Map<number | null, NamedStat>): NamedStat[] {
  return [...stats.values()]
    .map((s) => ({ ...s, revenue: round(s.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, TOP_NAMED_LIMIT);
}

/**
 * Category and brand come from the catalogue as it is now, not as it was at the sale — `items`
 * freezes the name and the price, nothing else. A re-categorised product counts where it sits today.
 */
export function namedBreakdowns(
  counted: AnalyticsOrderRow[],
  catalogue: Map<number, ProductMeta>,
): Pick<AnalyticsInsights, "categories" | "brands"> {
  const categories = new Map<number | null, NamedStat>();
  const brands = new Map<number | null, NamedStat>();

  const add = (map: Map<number | null, NamedStat>, id: number | null, name: string, qty: number, revenue: number) => {
    const stat = map.get(id) ?? { id, name, quantity: 0, revenue: 0 };
    stat.quantity += qty;
    stat.revenue += revenue;
    map.set(id, stat);
  };

  for (const row of counted) {
    for (const item of row.items ?? []) {
      const meta = catalogue.get(item.id);
      const revenue = item.price * item.quantity;
      add(categories, meta?.category?.id ?? null, meta?.category?.name ?? "Без категории", item.quantity, revenue);
      add(brands, meta?.brand?.id ?? null, meta?.brand?.name ?? "Без бренда", item.quantity, revenue);
    }
  }

  return { categories: sortNamed(categories), brands: sortNamed(brands) };
}

export function buildHeatmap(counted: AnalyticsOrderRow[]): HeatmapInsight {
  const cells = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  let peak: HeatmapInsight["peak"] = null;

  for (const row of counted) {
    const weekday = weekdayOf(shopDay(row.created_at));
    const hour = shopHour(row.created_at);
    cells[weekday][hour] += 1;
    if (!peak || cells[weekday][hour] > peak.orders) peak = { weekday, hour, orders: cells[weekday][hour] };
  }

  return { cells, max: peak?.orders ?? 0, peak };
}

export function buildPromo(counted: AnalyticsOrderRow[], catalogue: Map<number, ProductMeta>): PromoInsight {
  let goodsRevenue = 0;
  let promoRevenue = 0;
  let promoQuantity = 0;
  const soldPromo = new Set<number>();

  for (const row of counted) {
    for (const item of row.items ?? []) {
      const revenue = item.price * item.quantity;
      goodsRevenue += revenue;
      if (!catalogue.get(item.id)?.promo) continue;
      promoRevenue += revenue;
      promoQuantity += item.quantity;
      soldPromo.add(item.id);
    }
  }

  let catalogueProducts = 0;
  for (const meta of catalogue.values()) if (meta.published && meta.promo) catalogueProducts += 1;

  return {
    goodsRevenue: round(goodsRevenue),
    promoRevenue: round(promoRevenue),
    promoQuantity,
    soldProducts: soldPromo.size,
    catalogueProducts,
  };
}

/**
 * Only the zones where crossing the threshold changes the fee. "residential" is never free, and
 * "regions" / "urgent" are not charged by the tariff at all, so a basket there says nothing about
 * whether the threshold made anyone add to it.
 */
const THRESHOLD_ZONES = new Set<string>(DELIVERY_OPTIONS.filter((o) => o.freeOverThreshold).map((o) => o.id));

export function buildThreshold(counted: AnalyticsOrderRow[]): ThresholdInsight {
  const threshold = FREE_DELIVERY_THRESHOLD;
  const lastFrom = threshold + 5 * THRESHOLD_STEP;
  const bins: ThresholdBin[] = [];
  for (let from = 0; from < lastFrom; from += THRESHOLD_STEP) bins.push({ from, to: from + THRESHOLD_STEP, orders: 0 });
  bins.push({ from: lastFrom, to: null, orders: 0 });

  let orders = 0;
  let nearMiss = 0;
  let justOver = 0;

  for (const row of counted) {
    if (!row.delivery_type || !THRESHOLD_ZONES.has(row.delivery_type)) continue;
    // The threshold is on the goods; `total` includes the fee the threshold is about.
    const goods = row.total - row.delivery_cost;
    orders += 1;
    bins[Math.min(bins.length - 1, Math.floor(Math.max(0, goods) / THRESHOLD_STEP))].orders += 1;
    if (goods >= threshold - THRESHOLD_NEAR && goods < threshold) nearMiss += 1;
    if (goods >= threshold && goods < threshold + THRESHOLD_NEAR) justOver += 1;
  }

  return { threshold, orders, bins, nearMiss, justOver, near: THRESHOLD_NEAR };
}

/** Always over every order in the period — a cancellation rate that excluded cancellations would be 0. */
export function buildCancellations(rows: AnalyticsOrderRow[]): CancellationInsight {
  const byZone = new Map<string, { id: string; orders: number; cancelled: number }>();
  const byProduct = new Map<number, { id: number; name: string; orders: number; cancelled: number }>();
  let cancelled = 0;

  for (const row of rows) {
    const isCancelled = row.status === "cancelled";
    if (isCancelled) cancelled += 1;

    const zoneId = DELIVERY_OPTIONS.some((o) => o.id === row.delivery_type) ? row.delivery_type! : "unknown";
    const zone = byZone.get(zoneId) ?? { id: zoneId, orders: 0, cancelled: 0 };
    zone.orders += 1;
    if (isCancelled) zone.cancelled += 1;
    byZone.set(zoneId, zone);

    // Per order, not per line: a product listed twice in one cancelled order is one cancellation.
    const seen = new Set<number>();
    for (const item of row.items ?? []) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const product = byProduct.get(item.id) ?? { id: item.id, name: item.name, orders: 0, cancelled: 0 };
      product.orders += 1;
      if (isCancelled) product.cancelled += 1;
      byProduct.set(item.id, product);
    }
  }

  return {
    total: rows.length,
    cancelled,
    byZone: [...byZone.values()].sort((a, b) => b.orders - a.orders),
    byProduct: [...byProduct.values()]
      .filter((p) => p.cancelled > 0 && p.orders >= MIN_ORDERS_FOR_CANCEL_RATE)
      .sort((a, b) => b.cancelled - a.cancelled || b.cancelled / b.orders - a.cancelled / a.orders)
      .slice(0, TOP_NAMED_LIMIT),
  };
}

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((shopDayStart(to).getTime() - shopDayStart(from).getTime()) / DAY_MS);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const LIFETIME_BUCKETS = [
  { label: "1 заказ", min: 1, max: 1 },
  { label: "2 заказа", min: 2, max: 2 },
  { label: "3–4 заказа", min: 3, max: 4 },
  { label: "5 и больше", min: 5, max: Infinity },
];

/**
 * Cancelled orders are left out of the history here as everywhere a purchase is counted. Several
 * orders on the same day are separate purchases, so "days to second order" can be 0.
 */
export function buildRepeat(
  history: CustomerSeenRow[],
  counted: AnalyticsOrderRow[],
  firstDay: string,
  toDay: string,
): RepeatInsight {
  const daysByCustomer = new Map<string, string[]>();
  for (const row of history) {
    if (row.status === "cancelled") continue;
    const key = customerKey(row);
    if (!key) continue;
    const days = daysByCustomer.get(key) ?? [];
    days.push(shopDay(row.created_at));
    daysByCustomer.set(key, days);
  }
  for (const days of daysByCustomer.values()) days.sort();

  let cohort = 0;
  let returned = 0;
  const gaps: number[] = [];
  for (const days of daysByCustomer.values()) {
    if (days[0] < firstDay || days[0] > toDay) continue;
    cohort += 1;
    if (days.length < 2) continue;
    returned += 1;
    gaps.push(daysBetween(days[0], days[1]));
  }

  const active = new Set(counted.map(customerKey).filter(Boolean));
  const lifetime = LIFETIME_BUCKETS.map((b) => ({ label: b.label, customers: 0 }));
  for (const key of active) {
    // A customer active only through cancelled orders (when those are counted) still placed one.
    const orders = Math.max(1, daysByCustomer.get(key)?.length ?? 0);
    lifetime[LIFETIME_BUCKETS.findIndex((b) => orders >= b.min && orders <= b.max)].customers += 1;
  }

  const middle = median(gaps);
  return { cohort, returned, medianDaysToSecond: middle == null ? null : round(middle), lifetime };
}

/**
 * Favorites are a snapshot, not events — removing a heart deletes the row — so this compares the
 * wishlist as it stands today with the period's sales. Unpublished products are left out: nobody
 * can buy them, so their low sales mean nothing.
 */
export function buildFavorites(
  favoriteCounts: Map<number, number>,
  catalogue: Map<number, ProductMeta>,
  sold: Map<number, number>,
): FavoriteInsight[] {
  const rows: FavoriteInsight[] = [];
  for (const [id, favorites] of favoriteCounts) {
    const meta = catalogue.get(id);
    if (!meta?.published) continue;
    rows.push({ id, name: meta.name, favorites, sold: sold.get(id) ?? 0 });
  }
  return rows.sort((a, b) => b.favorites - a.favorites || a.sold - b.sold).slice(0, LIST_LIMIT);
}

/**
 * `since` is the period's first day, or null for "всё время". A product added during the period has
 * not had the whole period to sell, so it is not listed as unsold.
 */
export function buildUnsold(
  catalogue: Map<number, ProductMeta>,
  sold: Map<number, number>,
  since: string | null,
): UnsoldInsight {
  const cutoff = since ? shopDayStart(since).getTime() : null;
  let total = 0;
  let neverSold = 0;
  const stalled: UnsoldInsight["stalled"] = [];

  for (const meta of catalogue.values()) {
    if (!meta.published || sold.has(meta.id)) continue;
    if (cutoff != null && meta.createdAt && new Date(meta.createdAt).getTime() >= cutoff) continue;
    total += 1;
    if (meta.purchaseCount === 0) neverSold += 1;
    else stalled.push({ id: meta.id, name: meta.name, purchaseCount: meta.purchaseCount });
  }

  return {
    total,
    neverSold,
    stalled: stalled.sort((a, b) => b.purchaseCount - a.purchaseCount).slice(0, LIST_LIMIT),
  };
}
