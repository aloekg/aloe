"use server";

import { revalidatePath, updateTag } from "next/cache";
import sharp from "sharp";
import { productTag, touchesListings } from "@/lib/cache-tags";
import { DELIVERY_OPTIONS, LABEL_MAP, ORDER_STATUS, purchaseCountDelta } from "@/lib/constants";
import { generateInvoicePdf, type InvoiceItem } from "@/lib/invoice";
import { sendNewOrderEmail } from "@/lib/mailer";
import {
  isManualDeliveryCost,
  itemsTotalOf,
  money,
  normalizeOrderItems,
  priceOrder,
  validateDeliveryInput,
  validateOrderItems,
  type OrderItemInput,
} from "@/lib/order-pricing";
import { REVIEW_STATUS } from "@/lib/reviews";
import { adminRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { getAdminBrands } from "@/services/brand.service";
import { getOrderForNotification, markOrderNotified } from "@/services/order.service";
import { deleteReview, setReviewStatus } from "@/services/review.service";
import type { OrderItem } from "@/types";

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = adminRole(user);
  if (!user || !role) throw new Error("Unauthorized");
  return { user, role };
}

const adminDb = createAdminClient;

/**
 * Copies only the named keys, and only those the caller actually sent. The service role writes
 * whatever object it is handed, and the argument of a server action is what the browser posted, not
 * what the TypeScript type says — so `update(fields)` straight from the client let a request set
 * `purchase_count`, `rating_sum` or `created_at` on a product, past the trigger and past the rule that
 * the popular shelf counts confirmed orders only. Explicit columns or nothing.
 */
function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) if (key in source) out[key] = source[key];
  return out;
}

/**
 * The storage buckets are public, so the stored Content-Type decides whether an object is
 * rendered as an image or executed as a document. Neither `file.type` nor `file.name` can be
 * trusted for that — an `.svg` served as `image/svg+xml` is stored XSS on the Supabase origin.
 */
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * Product photos and banners are re-encoded server-side, so the upload accepts the untouched
 * original straight off a phone. Keep this under `experimental.serverActions.bodySizeLimit` in
 * next.config.ts — beyond that Next rejects the request before the action ever runs.
 */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/**
 * Cards render at ~300px and the detail page at ~700px, so one file cannot serve both without
 * wasting bandwidth on every grid. Every product upload is stored twice at these sizes.
 */
const PRODUCT_FULL = { width: 1200, quality: 82 };
const PRODUCT_THUMB = { width: 500, quality: 76 };

/**
 * The homepage renders the desktop and the mobile set as separate carousels, so each upload only
 * ever has to cover one breakpoint: desktop spans the `container` (≤1536px, minus padding), mobile
 * spans the viewport (≤~500px CSS, doubled for retina). One file per banner, no thumbnail pair.
 */
/**
 * An image placed inside a product's Markdown description renders in the prose column, which is
 * narrower than the photo above it and never full-bleed. One size, no thumbnail pair: unlike a
 * product photo it is rendered at exactly one place.
 */
const DESCRIPTION_IMAGE = { width: 900, quality: 80 };

const BANNER_DESKTOP = { width: 1600, quality: 82 };
const BANNER_MOBILE = { width: 1000, quality: 80 };

function encodeWebp(input: Buffer, { width, quality }: { width: number; quality: number }) {
  return (
    sharp(input)
      // Phone photos carry EXIF orientation; bake it in before resizing.
      .rotate()
      .resize(width, width, { fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer()
  );
}

/**
 * Category tiles render at ~200px on a phone grid and ~300px on the desktop one; one WebP at this
 * width covers both at retina density.
 */
const CATEGORY_IMAGE = { width: 800, quality: 80 };

/**
 * Validates, re-encodes to WebP and stores one image. Every upload in this file goes through here
 * now: the category path used to store the bytes as they arrived, under the Content-Type the
 * browser *claimed* — the one upload where a file that was not an image at all could land in a
 * public bucket with an image MIME. Decoding through sharp is what makes the declared type true.
 */
async function uploadEncoded(
  bucket: "product-images" | "banners" | "categories",
  formData: FormData,
  variant: { width: number; quality: number },
  prefix = "",
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const file = formData.get("file") as File | null;
  if (!file || !file.size) return { ok: false, error: "Файл не выбран" };
  if (!ALLOWED_IMAGE_TYPES[file.type]) return { ok: false, error: "Допустимы только JPEG, PNG, WebP и AVIF" };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Файл больше 15 МБ" };

  let body: Buffer;
  try {
    body = await encodeWebp(Buffer.from(await file.arrayBuffer()), variant);
  } catch {
    return { ok: false, error: "Не удалось обработать изображение — возможно, файл повреждён" };
  }

  const path = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
  const db = adminDb();
  const { error } = await db.storage
    .from(bucket)
    .upload(path, body, { contentType: "image/webp", cacheControl: "2592000" });
  if (error) return { ok: false, error: error.message };

  return { ok: true, url: db.storage.from(bucket).getPublicUrl(path).data.publicUrl };
}

/**
 * The status change, and with it `products.purchase_count` — the counter that ranks /popular, the
 * home page carousel and the "По популярности" sort.
 *
 * Checkout used to apply that counter and nothing ever took it back, which on production meant a
 * fifth of the units it ranked by came from orders that were cancelled. It now follows the status:
 * `purchaseCountDelta` decides whether this particular transition crosses into or out of the
 * counted set, and only then is the RPC called. See lib/constants.ts for the rule and the
 * 20260923120000 migration for the backfill.
 */
export async function updateOrderStatus(orderId: number, status: string) {
  await assertAdmin();
  if (!Object.hasOwn(ORDER_STATUS, status)) throw new Error(`Unknown order status: ${status}`);
  const db = adminDb();

  const { data: order, error: fetchError } = await db
    .from("orders")
    .select("status, items")
    .eq("id", orderId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!order) throw new Error("Заказ не найден");

  const delta = purchaseCountDelta(order.status, status);

  // Conditional on the status we just read, so two admins pressing at once cannot both see the old
  // value and apply the delta twice. No row back means someone else moved it first — their write
  // carried its own delta, and ours would be counting a transition that never happened.
  const { data: updated, error } = await db
    .from("orders")
    .update({ status })
    .eq("id", orderId)
    .eq("status", order.status)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) return;

  if (delta === 0) return;

  const { error: rpcError } = await db.rpc("increment_product_purchase_counts", {
    items: (order.items as OrderItem[]).map((i) => ({ id: i.id, qty: delta * i.quantity })),
  });
  // Logged, not thrown: the status is already persisted, and failing the action here would invite a
  // retry that moves nothing and counts nothing — the guard above would refuse the second write.
  if (rpcError) console.error("[admin] purchase count RPC failed:", rpcError.message);

  // Only purchase_count changed, and that is a sort key for exactly two cached queries. Expiring
  // the shared "products" tag invalidates all nine — homepage, categories, brands, /new, /sale,
  // /popular, every product page — and updateTag has no stale-while-revalidate, so the next visitor
  // waits for a full re-fetch. Those entries carry CATALOGUE_TTL (10 min) anyway.
  updateTag("products-popular");
}

export async function updateOrderItems(
  orderId: number,
  items: OrderItemInput[],
): Promise<
  | { ok: true; items: OrderItem[]; itemsTotal: number; deliveryCost: number; total: number }
  | { ok: false; error: string }
> {
  await assertAdmin();
  const db = adminDb();

  const invalid = validateOrderItems(items);
  if (invalid) return { ok: false, error: invalid };

  const { data: order, error: fetchError } = await db
    .from("orders")
    .select("items, delivery_type, delivery_cost")
    .eq("id", orderId)
    .single();
  if (fetchError || !order) return { ok: false, error: "Заказ не найден" };

  // Recompute rather than reuse: the free-delivery threshold has to be re-evaluated, otherwise
  // removing a line keeps free delivery the order no longer qualifies for, and adding one keeps
  // charging for delivery the site advertises as free.
  //
  // Unless the fee was agreed by phone — nothing in the schema records that, so it is inferred from
  // the fee the *previous* basket would have been charged. Without this, editing the items of a
  // regions order silently wipes the 500 с someone negotiated back to the tariff's 0.
  const stored = order.items as OrderItemInput[];
  const manual = isManualDeliveryCost(order.delivery_cost, order.delivery_type, itemsTotalOf(stored))
    ? order.delivery_cost
    : null;

  const normalized = normalizeOrderItems(items);
  const pricing = priceOrder(normalized, order.delivery_type, manual);

  const { error } = await db
    .from("orders")
    .update({ items: normalized, total: pricing.total, delivery_cost: pricing.deliveryCost })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/orders");
  // The normalized items go back so the card renders what was persisted, not the admin's draft.
  return { ok: true, items: normalized, ...pricing };
}

/**
 * The delivery zone and its fee, which the customer picks at checkout and often picks wrongly.
 * Separate from the items editor because the two are corrected on different occasions — and because
 * "regions" has no computable fee at all: it is agreed on the phone and can only be typed in.
 */
export async function updateOrderDelivery(
  orderId: number,
  deliveryType: string,
  /** null — charge the tariff; a number — a fee agreed by phone. */
  costOverride: number | null,
): Promise<{ ok: true; deliveryType: string; deliveryCost: number; total: number } | { ok: false; error: string }> {
  await assertAdmin();
  const db = adminDb();

  const invalid = validateDeliveryInput(deliveryType, costOverride);
  if (invalid) return { ok: false, error: invalid };

  // The basket is read from the row, never taken from the caller: a stale card must not be able to
  // rewrite what was ordered through the delivery form.
  const { data: order, error: fetchError } = await db.from("orders").select("items").eq("id", orderId).single();
  if (fetchError || !order) return { ok: false, error: "Заказ не найден" };

  const pricing = priceOrder(order.items as OrderItemInput[], deliveryType, costOverride);

  const { error } = await db
    .from("orders")
    .update({ delivery_type: deliveryType, delivery_cost: pricing.deliveryCost, total: pricing.total })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/orders");
  return { ok: true, deliveryType, deliveryCost: pricing.deliveryCost, total: pricing.total };
}

export async function downloadInvoice(orderId: number): Promise<{ ok: true; base64: string } | { ok: false }> {
  await assertAdmin();
  // maybeSingle + separate checks: `single` reports "no rows" and "more than one row" with the same
  // code, so a duplicate id used to download as a silent empty result. Only the miss is quiet now.
  const { data: order, error } = await adminDb().from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error) {
    console.error(`[invoice] order ${orderId} lookup failed: ${error.message}`);
    return { ok: false };
  }
  if (!order) return { ok: false };

  // price is nullable in the schema; multiplying it unguarded produced NaN as the invoice's
  // itemsTotal while `total` on the same document stayed correct — three lines that didn't add up.
  const itemsTotal = itemsTotalOf(order.items as OrderItemInput[]);

  const pdf = await generateInvoicePdf({
    orderId: String(order.id),
    createdAt: new Date(order.created_at ?? Date.now()),
    name: order.customer_name ?? "",
    phone: order.customer_phone ?? "",
    address: order.customer_address ?? "",
    comment: order.comment ?? "",
    deliveryCost: order.delivery_cost ?? 0,
    items: order.items as InvoiceItem[],
    itemsTotal,
    total: order.total,
  });

  return { ok: true, base64: pdf.toString("base64") };
}

/**
 * Re-sends the admin notification for an existing order and records the result. The SMTP breakage
 * on 2026-08-17 left no way to recover a lost notification except reading the order by hand.
 */
export async function resendOrderNotification(orderId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin();
  const db = adminDb();

  const { data: order, error } = await getOrderForNotification(db, orderId);
  if (error) return { ok: false, error: error.message };
  if (!order) return { ok: false, error: "Заказ не найден" };

  const items = normalizeOrderItems((order.items ?? []) as OrderItemInput[]);
  const itemsTotal = itemsTotalOf(items);
  const deliveryCost = order.delivery_cost ?? 0;
  const deliveryLabel = DELIVERY_OPTIONS.find((o) => o.id === order.delivery_type)?.label ?? order.delivery_type ?? "—";

  const payload = {
    orderId: String(order.id),
    name: order.customer_name ?? "",
    phone: order.customer_phone ?? "",
    address: order.customer_address ?? "",
    comment: order.comment ?? "",
    items,
    itemsTotal,
    deliveryLabel,
    deliveryCost,
    total: order.total ?? money(itemsTotal + deliveryCost),
  };

  try {
    const pdf = await generateInvoicePdf({
      ...payload,
      createdAt: order.created_at ? new Date(order.created_at) : new Date(),
    });
    const result = await sendNewOrderEmail(payload, pdf);
    if (!result.sent) return { ok: false, error: result.reason ?? "Не удалось отправить" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Не удалось отправить" };
  }

  await markOrderNotified(db, orderId);
  revalidatePath("/admin/orders");
  return { ok: true };
}

export type ProductInput = {
  id?: number;
  name: string;
  price: number;
  old_price?: number | null;
  image_url: string;
  thumbnail_url?: string | null;
  category: string;
  category_id: number;
  label?: "new" | "sale" | null;
  description?: string | null;
  brand_id?: number | null;
  seo_text?: string | null;
  published?: boolean;
};

/** Every column the editor may write. `purchase_count`, `rating_*`, `created_at`, `external_id` are not here on purpose. */
const PRODUCT_FIELDS = [
  "name",
  "price",
  "old_price",
  "image_url",
  "thumbnail_url",
  "category",
  "category_id",
  "label",
  "description",
  "brand_id",
  "seo_text",
  "published",
] as const satisfies readonly (keyof ProductInput)[];

export async function upsertProduct(
  data: ProductInput,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  await assertAdmin();
  const db = adminDb();

  if (data.label != null && !Object.hasOwn(LABEL_MAP, data.label)) return { ok: false, error: "Неизвестная метка" };
  const fields = pick(data, PRODUCT_FIELDS);

  if (data.id) {
    // The row as it is now, to tell an edit the lists can see from one only the product page can.
    // A missing row (deleted in another tab) falls through to the update, which then affects
    // nothing, and to the wide tag, which is the safe side.
    const { data: before } = await db
      .from("products")
      .select("name, price, old_price, image_url, thumbnail_url, category_id, label, brand_id, published")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await db.from("products").update(fields).eq("id", data.id);
    if (error) return { ok: false, error: error.message };

    // Its own tag always; the whole catalogue only when a card or a list order would change.
    // Editing a description — the common edit — used to expire 2400 products and their pages.
    updateTag(productTag(data.id));
    if (!before || touchesListings(before, fields)) updateTag("products");
    revalidatePath(`/product/${data.id}`);
    return { ok: true, id: data.id };
  }

  // A new product appears in lists, so the wide tag is the right one here.
  const { data: row, error } = await db.from("products").insert(fields).select("id").single();
  if (error) return { ok: false, error: error.message };
  updateTag("products");
  revalidatePath(`/product/${row.id}`);
  return { ok: true, id: row.id };
}

export async function deleteProduct(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin();
  const { error } = await adminDb().from("products").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  updateTag("products");
  // The product's own ISR page would keep serving for up to `revalidate` seconds otherwise.
  revalidatePath(`/product/${id}`);
  return { ok: true };
}

export type BulkProductUpdate = {
  brand_id?: number | null;
  price?: number;
  old_price?: number | null;
  label?: "new" | "sale" | null;
  published?: boolean;
  category_id?: number;
  category?: string;
};

const BULK_PRODUCT_FIELDS = [
  "brand_id",
  "price",
  "old_price",
  "label",
  "published",
  "category_id",
  "category",
] as const satisfies readonly (keyof BulkProductUpdate)[];

export async function bulkUpdateProducts(
  ids: number[],
  fields: BulkProductUpdate,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin();
  const update = pick(fields, BULK_PRODUCT_FIELDS);
  if (ids.length === 0 || Object.keys(update).length === 0) return { ok: true };
  if (update.label != null && !Object.hasOwn(LABEL_MAP, update.label)) return { ok: false, error: "Неизвестная метка" };
  if (!ids.every((id) => Number.isInteger(id) && id > 0)) return { ok: false, error: "Некорректный список товаров" };
  const { error } = await adminDb().from("products").update(update).in("id", ids);
  if (error) return { ok: false, error: error.message };
  updateTag("products");
  return { ok: true };
}

export type CategoryInput = {
  id?: number;
  name: string;
  parent_id: number | null;
  slug: string;
  image_url?: string | null;
};

const MAX_CATEGORY_DEPTH = 3;

/**
 * The admin UI renders exactly three levels and the storefront collects only levels 2-3, so a
 * category pushed to level 4 disappears from both — not editable, not deletable, and its products
 * vanish from the catalogue, with no way back through the UI.
 *
 * The dropdown filters candidate parents, but it ignores the *height* of the subtree being moved,
 * and the action itself checked nothing. `categories.parent_id` has no FK or trigger either, so
 * this is the only guard.
 */
async function validateCategoryDepth(
  db: ReturnType<typeof adminDb>,
  categoryId: number | undefined,
  parentId: number | null,
): Promise<string | null> {
  const { data, error } = await db.from("categories").select("id, parent_id");
  if (error) return "Не удалось проверить структуру категорий";

  const rows = data ?? [];
  const parentOf = new Map(rows.map((c) => [c.id, c.parent_id]));
  const childrenOf = new Map<number, number[]>();
  for (const c of rows) {
    if (c.parent_id == null) continue;
    if (!childrenOf.has(c.parent_id)) childrenOf.set(c.parent_id, []);
    childrenOf.get(c.parent_id)!.push(c.id);
  }

  // Depth of the new parent, 0 when moving to the top level.
  let depth = 0;
  for (let at = parentId; at != null; at = parentOf.get(at) ?? null) {
    depth++;
    if (depth > MAX_CATEGORY_DEPTH) return "Слишком глубокая вложенность категорий";
    if (categoryId != null && at === categoryId) return "Категорию нельзя перенести внутрь себя";
  }

  // Height of the subtree being moved, 1 for a leaf.
  const height = (id: number): number => 1 + Math.max(0, ...(childrenOf.get(id) ?? []).map(height));
  const moving = categoryId != null ? height(categoryId) : 1;

  if (depth + moving > MAX_CATEGORY_DEPTH) {
    return `Так категория и её подкатегории уйдут глубже ${MAX_CATEGORY_DEPTH} уровней — они пропадут из админки и с витрины`;
  }
  return null;
}

export async function upsertCategory(
  data: CategoryInput,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  await assertAdmin();
  const db = adminDb();

  if (!data.name?.trim()) return { ok: false, error: "Укажите название категории" };
  if (!data.slug?.trim()) return { ok: false, error: "Укажите slug" };

  const depthError = await validateCategoryDepth(db, data.id, data.parent_id);
  if (depthError) return { ok: false, error: depthError };

  const fields = { name: data.name, parent_id: data.parent_id, slug: data.slug, image_url: data.image_url ?? null };
  if (data.id) {
    const { error } = await db.from("categories").update(fields).eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    const { error: productsError } = await db
      .from("products")
      .update({ category: data.name })
      .eq("category_id", data.id);
    if (productsError) return { ok: false, error: productsError.message };
    updateTag("categories");
    updateTag("products");
    return { ok: true, id: data.id };
  }
  // max+1, not count: after any delete the sibling count stops equalling the highest sort_order,
  // so new categories collided with an existing one and admin/storefront ordering diverged.
  let siblingQuery = db.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  siblingQuery =
    data.parent_id !== null ? siblingQuery.eq("parent_id", data.parent_id) : siblingQuery.is("parent_id", null);
  // The error is checked rather than dropped: a failed lookup leaves `last` null, which silently
  // resolves to sort_order 0 and collides with an existing sibling — the very divergence the
  // max+1 rule above exists to prevent.
  const { data: last, error: siblingError } = await siblingQuery;
  if (siblingError) return { ok: false, error: siblingError.message };
  const sort_order = (last?.[0]?.sort_order ?? -1) + 1;
  const { data: row, error } = await db
    .from("categories")
    .insert({ ...fields, sort_order })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  updateTag("categories");
  return { ok: true, id: row.id };
}

export async function uploadCategoryImage(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await assertAdmin();
  return uploadEncoded("categories", formData, CATEGORY_IMAGE);
}

export async function deleteCategory(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin();
  const db = adminDb();

  // The only guard used to be client-side, and it worked off a snapshot taken at render time —
  // assigning products in another tab left the delete button enabled. The products FK is
  // ON DELETE SET NULL, so deleting an in-use category silently stripped category_id: the products
  // dropped out of every catalogue query while staying published, searchable and in the sitemap.
  const [{ count: productCount }, { count: childCount }] = await Promise.all([
    db.from("products").select("id", { count: "exact", head: true }).eq("category_id", id),
    db.from("categories").select("id", { count: "exact", head: true }).eq("parent_id", id),
  ]);

  if (childCount) return { ok: false, error: "Сначала удалите вложенные категории" };
  if (productCount) {
    return { ok: false, error: `В категории ${productCount} товаров — перенесите их перед удалением` };
  }

  const { error } = await db.from("categories").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  updateTag("categories");
  return { ok: true };
}

export async function reorderSubcategories(
  items: { id: number; sort_order: number }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin();
  const db = adminDb();
  const results = await Promise.all(
    items.map(({ id, sort_order }) => db.from("categories").update({ sort_order }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  updateTag("categories");
  return { ok: true };
}

export type BannerInput = {
  id?: number;
  image_url: string;
  sort_order: number;
  active: boolean;
  link?: string | null;
  type?: "desktop" | "mobile";
};

const BANNER_FIELDS = [
  "image_url",
  "sort_order",
  "active",
  "link",
  "type",
] as const satisfies readonly (keyof BannerInput)[];

export async function upsertBanner(
  data: BannerInput,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  await assertAdmin();
  const db = adminDb();
  if (data.type != null && data.type !== "desktop" && data.type !== "mobile") {
    return { ok: false, error: "Неизвестный тип баннера" };
  }
  const fields = pick(data, BANNER_FIELDS);
  if (data.id) {
    const { error } = await db.from("banners").update(fields).eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    updateTag("banners");
    return { ok: true, id: data.id };
  }
  const { data: row, error } = await db.from("banners").insert(fields).select("id").single();
  if (error) return { ok: false, error: error.message };
  updateTag("banners");
  return { ok: true, id: row.id };
}

export async function deleteBanner(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin();
  const { error } = await adminDb().from("banners").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  updateTag("banners");
  return { ok: true };
}

export async function reorderBanners(
  items: { id: number; sort_order: number }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin();
  const db = adminDb();
  const results = await Promise.all(
    items.map(({ id, sort_order }) => db.from("banners").update({ sort_order }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  updateTag("banners");
  return { ok: true };
}

export async function uploadBannerImage(
  formData: FormData,
  type: "desktop" | "mobile",
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await assertAdmin();
  return uploadEncoded("banners", formData, type === "mobile" ? BANNER_MOBILE : BANNER_DESKTOP);
}

export async function getBrands(): Promise<
  { ok: true; data: { id: number; name: string }[] } | { ok: false; error: string }
> {
  await assertAdmin();
  const supabase = await createClient();
  const data = await getAdminBrands(supabase);
  return { ok: true, data };
}

export type BrandInput = {
  id?: number;
  name: string;
  slug: string;
};

export async function upsertBrand(data: BrandInput): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  await assertAdmin();
  const db = adminDb();
  const fields = { name: data.name, slug: data.slug };
  if (data.id) {
    const { error } = await db.from("brands").update(fields).eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    // Product cards embed brands(name), so their cached payloads go stale too.
    updateTag("brands");
    updateTag("products");
    return { ok: true, id: data.id };
  }
  const { data: row, error } = await db.from("brands").insert(fields).select("id").single();
  if (error) return { ok: false, error: error.message };
  updateTag("brands");
  return { ok: true, id: row.id };
}

export async function deleteBrand(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin();
  const { error } = await adminDb().from("brands").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  updateTag("brands");
  updateTag("products");
  return { ok: true };
}

/**
 * Unlike banners and category tiles, a product photo is stored as two derivatives: the large one
 * for `products.image_url` (detail page, quick-view modal) and a small one for
 * `products.thumbnail_url` (card grids, carousels, cart rows).
 */
export async function uploadProductImage(
  formData: FormData,
): Promise<{ ok: true; url: string; thumbnailUrl: string } | { ok: false; error: string }> {
  await assertAdmin();

  const file = formData.get("file") as File | null;
  if (!file || !file.size) return { ok: false, error: "Файл не выбран" };
  if (!ALLOWED_IMAGE_TYPES[file.type]) return { ok: false, error: "Допустимы только JPEG, PNG, WebP и AVIF" };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Файл больше 15 МБ" };

  const input = Buffer.from(await file.arrayBuffer());

  let full: Buffer;
  let thumb: Buffer;
  try {
    [full, thumb] = await Promise.all([encodeWebp(input, PRODUCT_FULL), encodeWebp(input, PRODUCT_THUMB)]);
  } catch {
    return { ok: false, error: "Не удалось обработать изображение — возможно, файл повреждён" };
  }

  const base = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const db = adminDb();

  for (const [path, body] of [
    [`${base}.webp`, full],
    [`thumb/${base}.webp`, thumb],
  ] as const) {
    const { error } = await db.storage
      .from("product-images")
      .upload(path, body, { contentType: "image/webp", cacheControl: "2592000" });
    if (error) return { ok: false, error: error.message };
  }

  return {
    ok: true,
    url: db.storage.from("product-images").getPublicUrl(`${base}.webp`).data.publicUrl,
    thumbnailUrl: db.storage.from("product-images").getPublicUrl(`thumb/${base}.webp`).data.publicUrl,
  };
}

/**
 * Uploads one image for a product's Markdown description and returns its URL. It writes no column —
 * the admin pastes the returned `![](url)` into the description text itself.
 *
 * It exists because there was no way to get an image *into* a description. The dropzone at the top
 * of the editor sets the product photo (image_url/thumbnail_url); nothing offered a URL to put in
 * the text. So the descriptions imported from the old shop hotlink the manufacturers' sites
 * instead — 27 such images across nine products, half of them already returning 404, and every one
 * of them blocked the moment the CSP stops being Report-Only, because `img-src` names only this
 * project's own origin (lib/csp.ts).
 *
 * Stored under `inline/` rather than beside the photos: scripts/prune-orphan-images.mjs decides
 * what to delete by subtracting referenced paths from the bucket, and a description image is
 * referenced from free text rather than from a column. That script now reads the text too — the
 * prefix is what makes these objects recognisable while looking at the bucket rather than the rows.
 */
export async function uploadDescriptionImage(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await assertAdmin();
  return uploadEncoded("product-images", formData, DESCRIPTION_IMAGE, "inline/");
}

/**
 * Roles live in `app_metadata`, which only the service role can write — nothing a user can reach
 * grants one. Both guards read the role through `auth.getUser()`, which asks the Auth server
 * instead of trusting the claims baked into the access token, so a grant and — more importantly —
 * a revocation take effect on the very next request rather than whenever that token refreshes.
 *
 * Two rules make the hierarchy hold, and both are enforced here rather than in the UI, since the
 * browser supplies the id:
 *   - only a super-admin hands out access, so an ordinary admin cannot widen the circle;
 *   - a super-admin's own role is never written from the app, in either direction. That is what
 *     makes it un-revokable: the account that owns the shop cannot be demoted by anyone who got
 *     in through this page, and the only way to change it is in Supabase directly.
 */
export async function setUserRole(
  userId: string,
  makeAdmin: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { role } = await assertAdmin();
  if (role !== "superadmin") return { ok: false, error: "Права администратора выдаёт только супер-админ" };

  const db = adminDb();

  // The target's role is re-read here, not taken from whatever the page was rendered with: a
  // stale list (or a hand-made request) must not be able to demote the super-admin.
  const { data: target, error: lookupError } = await db.auth.admin.getUserById(userId);
  if (lookupError) return { ok: false, error: lookupError.message };
  if (adminRole(target.user) === "superadmin") {
    return { ok: false, error: "Роль супер-админа меняется только в Supabase" };
  }

  const { error } = await db.auth.admin.updateUserById(userId, {
    // GoTrue merges `app_metadata` key by key and deletes the ones passed as null, so this leaves
    // the rest of the metadata alone and removes `role` outright rather than storing a null one.
    app_metadata: { role: makeAdmin ? "admin" : null },
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}

/* -------------------------------------------------------------------------------------------- */
/* Reviews                                                                                        */

/**
 * Moderation. A review is invisible until it passes through here, which is the whole anti-spam
 * story for a shop with one owner — and the reason `submitReview` expires no cache tag: nothing it
 * writes is public yet. Approving (or un-approving) changes the product's denormalised rating via
 * the trigger in 20260923140000, and that rating is on every card, so the catalogue tag goes here.
 */
export async function setReviewModeration(reviewId: number, status: "pending" | "approved" | "rejected") {
  await assertAdmin();
  if (!Object.hasOwn(REVIEW_STATUS, status)) throw new Error(`Unknown review status: ${status}`);

  const { data, error } = await setReviewStatus(adminDb(), reviewId, status);
  if (error) throw new Error(error.message);

  // One product, not the catalogue: its page shows the review now, and the stars on its card in
  // the lists catch up within the catalogue TTL (see getCachedProductReviews).
  if (data) {
    updateTag(productTag(data.product_id));
    revalidatePath(`/product/${data.product_id}`);
  }
  revalidatePath("/admin/reviews");
}

/**
 * Deletes a review outright, for the case moderation cannot cover: content that must not sit in the
 * database at all. Rejecting is the ordinary action — it keeps the row, so the same person cannot
 * simply post again through the unique constraint on (order_id, product_id).
 */
export async function removeReview(reviewId: number) {
  await assertAdmin();
  const { data, error } = await deleteReview(adminDb(), reviewId);
  if (error) throw new Error(error.message);

  if (data) {
    updateTag(productTag(data.product_id));
    revalidatePath(`/product/${data.product_id}`);
  }
  revalidatePath("/admin/reviews");
}
