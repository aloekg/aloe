import type { SupabaseClient } from "@supabase/supabase-js";
import { getDeliveryCost } from "@/lib/constants";
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
