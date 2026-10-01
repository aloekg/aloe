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

// Explicit columns only: the service role writes whatever the browser posted (purchase_count, rating_sum…).
function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) if (key in source) out[key] = source[key];
  return out;
}

// The stored Content-Type decides how a public object renders; never allow SVG (stored XSS).
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

// Keep under experimental.serverActions.bodySizeLimit in next.config.ts.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const PRODUCT_FULL = { width: 1200, quality: 82 };
const PRODUCT_THUMB = { width: 500, quality: 76 };

const DESCRIPTION_IMAGE = { width: 900, quality: 80 };

const BANNER_DESKTOP = { width: 1600, quality: 82 };
const BANNER_MOBILE = { width: 1000, quality: 80 };

function encodeWebp(input: Buffer, { width, quality }: { width: number; quality: number }) {
  return (
    sharp(input)
      // Bakes in EXIF orientation before resizing.
      .rotate()
      .resize(width, width, { fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer()
  );
}

const CATEGORY_IMAGE = { width: 800, quality: 80 };

// Every upload goes through here: decoding via sharp is what makes the stored image/webp type true.
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

  // Compare-and-swap on the status just read, so concurrent admins cannot both apply the delta.
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
  // Logged, not thrown: the status is already persisted and a retry would count nothing.
  if (rpcError) console.error("[admin] purchase count RPC failed:", rpcError.message);

  // Only products-popular: the wide "products" tag would expire the whole catalogue for one sort key.
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

  // Recompute so the free-delivery threshold re-applies; keep a phone-agreed fee (inferred from the previous basket).
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
  return { ok: true, items: normalized, ...pricing };
}

export async function updateOrderDelivery(
  orderId: number,
  deliveryType: string,
  // null charges the tariff; a number is a fee agreed by phone.
  costOverride: number | null,
): Promise<{ ok: true; deliveryType: string; deliveryCost: number; total: number } | { ok: false; error: string }> {
  await assertAdmin();
  const db = adminDb();

  const invalid = validateDeliveryInput(deliveryType, costOverride);
  if (invalid) return { ok: false, error: invalid };

  // The basket is read from the row, never taken from the caller.
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
  // maybeSingle, not single: single reports no rows and duplicate rows with the same code.
  const { data: order, error } = await adminDb().from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error) {
    console.error(`[invoice] order ${orderId} lookup failed: ${error.message}`);
    return { ok: false };
  }
  if (!order) return { ok: false };

  // price is nullable in the schema; unguarded it makes itemsTotal NaN.
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

// purchase_count, rating_*, created_at and external_id are left out on purpose.
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
    const { data: before } = await db
      .from("products")
      .select("name, price, old_price, image_url, thumbnail_url, category_id, label, brand_id, published")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await db.from("products").update(fields).eq("id", data.id);
    if (error) return { ok: false, error: error.message };

    // Own tag always; the catalogue tag only when a card or list order changes (ISR write budget).
    updateTag(productTag(data.id));
    if (!before || touchesListings(before, fields)) updateTag("products");
    revalidatePath(`/product/${data.id}`);
    return { ok: true, id: data.id };
  }

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
  // Tags alone leave the product's ISR page serving until `revalidate`.
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

// The only guard against a 4th level (the UI renders three; deeper ones vanish): checks the moved subtree's height too.
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

  let depth = 0;
  for (let at = parentId; at != null; at = parentOf.get(at) ?? null) {
    depth++;
    if (depth > MAX_CATEGORY_DEPTH) return "Слишком глубокая вложенность категорий";
    if (categoryId != null && at === categoryId) return "Категорию нельзя перенести внутрь себя";
  }

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
  // max+1, not count: after a delete the count no longer equals the highest sort_order.
  let siblingQuery = db.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  siblingQuery =
    data.parent_id !== null ? siblingQuery.eq("parent_id", data.parent_id) : siblingQuery.is("parent_id", null);
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

  // Checked server-side: the client's lock is a render-time snapshot.
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
  // ≤ 200 characters, matching the DB check.
  alt?: string | null;
  type?: "desktop" | "mobile";
};

const MAX_BANNER_ALT = 200;

const BANNER_FIELDS = [
  "image_url",
  "sort_order",
  "active",
  "link",
  "alt",
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
  if (data.alt != null && (typeof data.alt !== "string" || data.alt.length > MAX_BANNER_ALT)) {
    return { ok: false, error: `Описание баннера — не длиннее ${MAX_BANNER_ALT} символов` };
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
    // Product cards embed brands(name), so the catalogue tag goes too.
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

// Stored under inline/: prune-orphan-images.mjs recognises description images by that prefix.
export async function uploadDescriptionImage(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await assertAdmin();
  return uploadEncoded("product-images", formData, DESCRIPTION_IMAGE, "inline/");
}

// Only a super-admin grants access, and a superadmin role is never written from the app.
// Enforced here, not in the UI: the browser supplies the id.
export async function setUserRole(
  userId: string,
  makeAdmin: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { role } = await assertAdmin();
  if (role !== "superadmin") return { ok: false, error: "Права администратора выдаёт только супер-админ" };

  const db = adminDb();

  // Re-read the target's role: a stale list or crafted request must not demote the super-admin.
  const { data: target, error: lookupError } = await db.auth.admin.getUserById(userId);
  if (lookupError) return { ok: false, error: lookupError.message };
  if (adminRole(target.user) === "superadmin") {
    return { ok: false, error: "Роль супер-админа меняется только в Supabase" };
  }

  const { error } = await db.auth.admin.updateUserById(userId, {
    // GoTrue deletes app_metadata keys passed as null: this removes `role` and keeps the rest.
    app_metadata: { role: makeAdmin ? "admin" : null },
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setReviewModeration(reviewId: number, status: "pending" | "approved" | "rejected") {
  await assertAdmin();
  if (!Object.hasOwn(REVIEW_STATUS, status)) throw new Error(`Unknown review status: ${status}`);

  const { data, error } = await setReviewStatus(adminDb(), reviewId, status);
  if (error) throw new Error(error.message);

  // Product tag only, not the catalogue: card stars catch up within CATALOGUE_TTL.
  if (data) {
    updateTag(productTag(data.product_id));
    revalidatePath(`/product/${data.product_id}`);
  }
  revalidatePath("/admin/reviews");
}

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
