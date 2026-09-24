import type { SupabaseClient } from "@supabase/supabase-js";
import { DELIVERY_OPTIONS, getDeliveryCost, MIN_ORDER_TOTAL } from "@/lib/constants";
import type { OrderItem } from "@/types";
import type { Database } from "@/types/database";

/**
 * Order money, kept out of app/checkout/actions.ts on purpose.
 *
 * This is the one place the sum a customer pays is computed — both `quoteOrder` (what they are
 * shown) and `createOrder` (what is persisted) go through it, so the two cannot disagree, which is
 * exactly what happened while the client totalled the cart from its own localStorage prices.
 *
 * It lives here rather than in the action file because a `"use server"` module may only export
 * server actions: exporting this from there to test it would publish it as an endpoint. The
 * database touch is isolated behind `ProductLookup` for the same reason — the pricing rules are
 * then exercised by tests/order-pricing.test.ts with a plain function and no database.
 */

/** What the browser is allowed to send: ids and quantities only — never prices. */
export type OrderLine = { id: number; quantity: number };

/** Line the client asked for that cannot be ordered, with the reason, so the UI can name it. */
export type RejectedLine = { id: number; name: string | null; reason: "missing" | "no-price" };

export type Quote = {
  items: OrderItem[];
  itemsTotal: number;
  deliveryCost: number;
  total: number;
  /** Empty when everything resolved; otherwise the caller should prune these and re-quote. */
  rejected: RejectedLine[];
};

export const MAX_LINES = 100;
export const MAX_QUANTITY = 999;

/** Money is `numeric` in Postgres; keep two decimals so float artefacts never reach a customer. */
export function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Rejects a cart that cannot have come from the app, and merges what is merely redundant. Returns
 * null for the former: a non-integer id or quantity means the payload was hand-made, and pricing a
 * hand-made payload is not something to attempt.
 */
export function parseLines(items: unknown): OrderLine[] | null {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_LINES) return null;

  const byId = new Map<number, number>();
  for (const raw of items) {
    const id = Number((raw as OrderLine)?.id);
    const quantity = Number((raw as OrderLine)?.quantity);
    if (!Number.isInteger(id) || id <= 0) return null;
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) return null;
    // Same product sent twice — merge rather than reject.
    byId.set(id, Math.min(MAX_QUANTITY, (byId.get(id) ?? 0) + quantity));
  }
  return [...byId].map(([id, quantity]) => ({ id, quantity }));
}

/**
 * How much the goods are short of `MIN_ORDER_TOTAL`, or 0 when the basket qualifies. Measured on
 * `itemsTotal`, so it is decided by the lines that survived pricing, never by delivery.
 *
 * The checkout form shows it and `createOrder` refuses on it — the same function, so the button a
 * customer sees disabled and the order the server rejects can never disagree by a сом.
 */
export function minOrderShortfall(itemsTotal: number): number {
  return money(Math.max(0, MIN_ORDER_TOTAL - itemsTotal));
}

/** A published product's priced columns, as the database returns them. */
export type PricedProduct = {
  id: number | string;
  name: string | null;
  price: number | string | null;
  image_url: string | null;
};

/** The only database access pricing needs: published rows for these ids, in any order. */
export type ProductLookup = (ids: number[]) => Promise<PricedProduct[]>;

export async function buildQuote(lookup: ProductLookup, lines: OrderLine[], deliveryType: string): Promise<Quote> {
  const priced = new Map((await lookup(lines.map((l) => l.id))).map((p) => [Number(p.id), p]));
  const items: OrderItem[] = [];
  const rejected: RejectedLine[] = [];

  for (const line of lines) {
    const product = priced.get(line.id);
    if (!product) {
      // Unpublished or deleted between rendering the cart and checking out.
      rejected.push({ id: line.id, name: null, reason: "missing" });
      continue;
    }
    // price is nullable in the schema; Number(null) is 0, which used to make such a product
    // orderable for free.
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
      image_url: product.image_url ?? "",
    });
  }

  const itemsTotal = money(items.reduce((sum, i) => sum + i.price * i.quantity, 0));
  // Delivery is charged on the goods that survived, not on what the client asked for: the free
  // threshold must not be met by a line that was just rejected. And nothing priceable means
  // nothing to deliver — otherwise a cart whose every line was rejected quotes "Итого 200 сом"
  // for an empty order, since a zero total sits below the free-delivery threshold. `createOrder`
  // refuses such a cart outright, so today this is what the checkout page shows rather than
  // what anyone is charged; it stops being harmless the moment that guard is relaxed.
  const deliveryCost = items.length === 0 ? 0 : money(getDeliveryCost(deliveryType, itemsTotal));
  return { items, itemsTotal, deliveryCost, total: money(itemsTotal + deliveryCost), rejected };
}

/**
 * The production lookup. Only published rows: an unpublished product comes back missing and is
 * rejected by name, rather than being priced from a row the storefront would never show.
 */
export function publishedPriceLookup(admin: SupabaseClient<Database>): ProductLookup {
  return async (ids) => {
    const { data, error } = await admin
      .from("products")
      .select("id, name, price, image_url")
      .in("id", ids)
      .eq("published", true);

    // Thrown, not swallowed: an outage must not silently reprice the order.
    if (error) throw new Error(`[checkout] product lookup failed: ${error.message}`);
    return data ?? [];
  };
}

/* -------------------------------------------------------------------------------------------------
 * Admin order editing
 *
 * Everything above prices a *customer's* cart, where the client may only send ids and quantities.
 * An admin editing a placed order is the opposite case: they type the name and the price, because
 * the whole point is to correct what the catalogue says. `assertAdmin()` is then the only thing
 * between a crafted request and an arbitrary order total, which is why the caps below exist rather
 * than a bare "is it a number".
 * ---------------------------------------------------------------------------------------------- */

/** An order line as the admin editor sends it. Unlike `OrderItem`, still unvalidated. */
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
/** A storage URL is ~120 characters; this is headroom, not a target. */
export const MAX_IMAGE_URL = 2048;

/**
 * The image an edited line will render with — in the admin list and, through "Повторить заказ", in
 * the customer's own cart. Empty is fine (the row falls back to a placeholder); anything present
 * must be an absolute http(s) URL, since the admin supplies it and `<img src>` will load whatever
 * it says.
 */
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

/** The goods total of a stored or edited order. `price` is nullable in the schema; null is not NaN. */
export function itemsTotalOf(items: readonly { price: number | null; quantity: number }[]): number {
  return money(items.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0));
}

/** First failing rule, as the message the admin is shown, or null when the basket is sound. */
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

    // A zero price is allowed here and rejected at checkout: there the catalogue supplies it, so a
    // zero means a broken row; here the admin typed it, to write off a line or replace it with a gift.
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

/**
 * Collapses validated input into the strict `OrderItem` the `orders.items` column is typed as.
 * Persist this, not the raw payload: it is what keeps a nullable price or a stray space out of a
 * document that `Order` promises is neither.
 */
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

/**
 * The money on a placed order. `manualDeliveryCost` is a fee agreed by phone — null means charge the
 * tariff, which re-evaluates the free-delivery threshold against the goods total.
 */
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

/**
 * Whether a stored delivery fee was typed in rather than derived from the tariff — the difference
 * between "the admin accepted 200" and "the admin fixed it at 200", which nothing in the schema
 * records. Without it, editing the items of a regions order would wipe the fee agreed by phone back
 * to the tariff's 0.
 *
 * Exact for every order created through checkout, which always stores the tariff value. The one
 * blind spot is a manual fee that happens to equal the tariff, which then recomputes to itself.
 */
export function isManualDeliveryCost(storedCost: number, deliveryType: string | null, itemsTotal: number): boolean {
  return money(storedCost) !== money(getDeliveryCost(deliveryType ?? "", itemsTotal));
}

/**
 * A money field as typed: accepts the ru-RU comma and grouping spaces, rejects anything still being
 * typed. Returning null rather than NaN is what lets the editor show "—" mid-keystroke instead of
 * writing a broken total.
 */
export function parsePriceInput(input: string): number | null {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
