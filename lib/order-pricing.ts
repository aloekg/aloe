import type { SupabaseClient } from "@supabase/supabase-js";
import { DELIVERY_OPTIONS, getDeliveryCost, MIN_ORDER_TOTAL } from "@/lib/constants";
import type { OrderItem } from "@/types";
import type { Database } from "@/types/database";

// Must not move into a "use server" file: every export there becomes a public endpoint.

// Ids and quantities only: prices are never taken from the client.
export type OrderLine = { id: number; quantity: number };

export type RejectedLine = { id: number; name: string | null; reason: "missing" | "no-price" };

export type Quote = {
  items: OrderItem[];
  itemsTotal: number;
  deliveryCost: number;
  total: number;
  rejected: RejectedLine[];
};

export const MAX_LINES = 100;
export const MAX_QUANTITY = 999;

export function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseLines(items: unknown): OrderLine[] | null {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_LINES) return null;

  const byId = new Map<number, number>();
  for (const raw of items) {
    const id = Number((raw as OrderLine)?.id);
    const quantity = Number((raw as OrderLine)?.quantity);
    if (!Number.isInteger(id) || id <= 0) return null;
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) return null;
    byId.set(id, Math.min(MAX_QUANTITY, (byId.get(id) ?? 0) + quantity));
  }
  return [...byId].map(([id, quantity]) => ({ id, quantity }));
}

export function minOrderShortfall(itemsTotal: number): number {
  return money(Math.max(0, MIN_ORDER_TOTAL - itemsTotal));
}

export type PricedProduct = {
  id: number | string;
  name: string | null;
  price: number | string | null;
  image_url: string | null;
  thumbnail_url?: string | null;
};

export type ProductLookup = (ids: number[]) => Promise<PricedProduct[]>;

export async function buildQuote(lookup: ProductLookup, lines: OrderLine[], deliveryType: string): Promise<Quote> {
  const priced = new Map((await lookup(lines.map((l) => l.id))).map((p) => [Number(p.id), p]));
  const items: OrderItem[] = [];
  const rejected: RejectedLine[] = [];

  for (const line of lines) {
    const product = priced.get(line.id);
    if (!product) {
      rejected.push({ id: line.id, name: null, reason: "missing" });
      continue;
    }
    // price is nullable: Number(null) is 0, which would make the product free.
    const price = product.price == null ? null : Number(product.price);
    if (price == null || !Number.isFinite(price) || price <= 0) {
      rejected.push({ id: line.id, name: product.name, reason: "no-price" });
      continue;
    }
    items.push({
      id: Number(product.id),
      name: String(product.name),
      price,
      quantity: line.quantity,
      // The thumbnail on purpose: every consumer draws a frozen line at 40–64px.
      image_url: product.thumbnail_url || product.image_url || "",
    });
  }

  const itemsTotal = money(items.reduce((sum, i) => sum + i.price * i.quantity, 0));
  // Priced on surviving lines only, so a rejected line cannot meet the free-delivery threshold.
  const deliveryCost = items.length === 0 ? 0 : money(getDeliveryCost(deliveryType, itemsTotal));
  return { items, itemsTotal, deliveryCost, total: money(itemsTotal + deliveryCost), rejected };
}

// Published rows only: an unpublished product must come back missing, never priced.
export function publishedPriceLookup(admin: SupabaseClient<Database>): ProductLookup {
  return async (ids) => {
    const { data, error } = await admin
      .from("products")
      .select("id, name, price, image_url, thumbnail_url")
      .in("id", ids)
      .eq("published", true);

    // Thrown, not swallowed: an outage must not silently reprice the order.
    if (error) throw new Error(`[checkout] product lookup failed: ${error.message}`);
    return data ?? [];
  };
}

// Admin edits take name and price from the client: assertAdmin() and these caps are the only guard.
export type OrderItemInput = {
  id: number;
  name: string;
  price: number | null;
  quantity: number;
  image_url: string | null;
};

export const MAX_ITEM_NAME = 200;
export const MAX_ITEM_PRICE = 1_000_000;
export const MAX_DELIVERY_COST = 100_000;
export const MAX_IMAGE_URL = 2048;

export function isAcceptableImageUrl(value: unknown): value is string | null | undefined {
  if (value == null || value === "") return true;
  if (typeof value !== "string" || value.length > MAX_IMAGE_URL) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export type OrderMoney = { itemsTotal: number; deliveryCost: number; total: number };

export function itemsTotalOf(items: readonly { price: number | null; quantity: number }[]): number {
  return money(items.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0));
}

export function validateOrderItems(items: OrderItemInput[]): string | null {
  if (!Array.isArray(items) || items.length === 0) return "В заказе должен остаться хотя бы один товар";
  if (items.length > MAX_LINES) return `Слишком много позиций — не больше ${MAX_LINES}`;

  const seen = new Set<number>();
  for (const item of items) {
    if (!Number.isInteger(item?.id) || item.id <= 0) return "Некорректная позиция заказа";
    if (seen.has(item.id)) return "Один товар не может быть в заказе дважды";
    seen.add(item.id);

    if (typeof item.name !== "string" || !item.name.trim()) return "Укажите название товара";
    if (item.name.trim().length > MAX_ITEM_NAME) return `Название товара длиннее ${MAX_ITEM_NAME} символов`;

    // Zero is allowed here (admin write-off) but rejected at checkout, on purpose.
    if (item.price == null || !Number.isFinite(item.price)) return "Укажите цену товара числом";
    if (item.price < 0) return "Цена товара не может быть отрицательной";
    if (item.price > MAX_ITEM_PRICE) return "Цена товара не может превышать 1 000 000";

    if (!Number.isInteger(item.quantity) || item.quantity <= 0)
      return "Количество должно быть целым положительным числом";
    if (item.quantity > MAX_QUANTITY) return `Количество не может превышать ${MAX_QUANTITY}`;

    if (!isAcceptableImageUrl(item.image_url)) return "Ссылка на изображение должна быть адресом http(s)";
  }
  return null;
}

// Persist this, not the raw payload.
export function normalizeOrderItems(items: OrderItemInput[]): OrderItem[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name.trim(),
    price: money(item.price ?? 0),
    quantity: item.quantity,
    image_url: item.image_url ?? "",
  }));
}

export function validateDeliveryInput(deliveryType: string, costOverride: number | null): string | null {
  if (!DELIVERY_OPTIONS.some((o) => o.id === deliveryType)) return "Неизвестный способ доставки";
  if (costOverride == null) return null;
  if (!Number.isFinite(costOverride)) return "Укажите стоимость доставки числом";
  if (costOverride < 0) return "Стоимость доставки не может быть отрицательной";
  if (costOverride > MAX_DELIVERY_COST) return "Стоимость доставки не может превышать 100 000";
  return null;
}

export function priceOrder(
  items: readonly { price: number | null; quantity: number }[],
  deliveryType: string | null,
  manualDeliveryCost?: number | null,
): OrderMoney {
  const itemsTotal = itemsTotalOf(items);
  const deliveryCost = money(
    manualDeliveryCost != null && Number.isFinite(manualDeliveryCost) && manualDeliveryCost >= 0
      ? manualDeliveryCost
      : getDeliveryCost(deliveryType ?? "", itemsTotal),
  );
  return { itemsTotal, deliveryCost, total: money(itemsTotal + deliveryCost) };
}

// Inferred, since the schema does not record a typed fee; a manual fee equal to the tariff reads as derived.
export function isManualDeliveryCost(storedCost: number, deliveryType: string | null, itemsTotal: number): boolean {
  return money(storedCost) !== money(getDeliveryCost(deliveryType ?? "", itemsTotal));
}

export function parsePriceInput(input: string): number | null {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
