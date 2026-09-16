"use server";

import { updateTag } from "next/cache";
import { after } from "next/server";
import { DELIVERY_OPTIONS } from "@/lib/constants";
import { generateInvoicePdf } from "@/lib/invoice";
import { sendNewOrderEmail } from "@/lib/mailer";
import { buildQuote, money, parseLines, publishedPriceLookup } from "@/lib/order-pricing";
import type { OrderLine, Quote, RejectedLine } from "@/lib/order-pricing";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { CONTACT_LIMITS, normalizeText } from "@/lib/text";
import { insertOrder, markOrderNotified } from "@/services/order.service";

// The comment field is checkout-only; the other three are shared with the profile form.
const LIMITS = { ...CONTACT_LIMITS, comment: 1000 } as const;

type Failure = { ok: false; error: string };

type CreateOrderResult = { ok: true; orderId: string } | (Failure & { rejected?: RejectedLine[]; quote?: Quote });

function fail(error: string): Failure {
  return { ok: false, error };
}

/**
 * What the checkout page renders. Public and unauthenticated like `createOrder`, and validated
 * the same way — it only reads.
 */
export async function quoteOrder({
  items,
  deliveryType,
}: {
  items: OrderLine[];
  deliveryType: string;
}): Promise<{ ok: true; quote: Quote } | Failure> {
  if (!DELIVERY_OPTIONS.some((o) => o.id === deliveryType)) return fail("Выберите способ доставки.");

  const lines = parseLines(items);
  if (!lines) return fail("Корзина повреждена. Обновите страницу и попробуйте ещё раз.");

  // Read-only, and the checkout page re-quotes on every cart or delivery change, so this is much
  // looser than createOrder — it only exists to bound a scripted loop.
  const { allowed } = await rateLimit("quote-order", { limit: 60, windowSeconds: 60 });
  if (!allowed) return fail("Слишком много запросов. Обновите страницу через минуту.");

  try {
    return {
      ok: true as const,
      quote: await buildQuote(publishedPriceLookup(createAdminClient()), lines, deliveryType),
    };
  } catch (err) {
    console.error("[checkout] quote failed", err);
    return fail("Не удалось рассчитать заказ. Попробуйте ещё раз.");
  }
}

export async function createOrder({
  name,
  phone,
  address,
  comment,
  items,
  deliveryType,
  quotedTotal,
}: {
  name: string;
  phone: string;
  address: string;
  comment: string;
  items: OrderLine[];
  deliveryType: string;
  /** Total the customer was shown, from `quoteOrder`. Mismatch means prices moved mid-checkout. */
  quotedTotal?: number;
}): Promise<CreateOrderResult> {
  if (!DELIVERY_OPTIONS.some((o) => o.id === deliveryType)) {
    return fail("Выберите способ доставки.");
  }

  // A public endpoint that inserts, runs an RPC, renders a PDF and sends mail. Five orders a
  // minute is well clear of any real customer, including a corrected re-submit.
  const { allowed } = await rateLimit("create-order", { limit: 5, windowSeconds: 60 });
  if (!allowed) return fail("Слишком много попыток. Подождите минуту и попробуйте снова.");

  const customerName = normalizeText(name, LIMITS.name);
  const customerPhone = normalizeText(phone, LIMITS.phone);
  const customerAddress = normalizeText(address, LIMITS.address);
  const customerComment = normalizeText(comment, LIMITS.comment);

  if (!customerName || !customerPhone || !customerAddress) {
    return fail("Заполните имя, телефон и адрес доставки.");
  }
  if (customerPhone.replace(/\D/g, "").length < 9) {
    return fail("Укажите корректный номер телефона.");
  }

  const lines = parseLines(items);
  if (!lines) return fail("Корзина повреждена. Обновите страницу и попробуйте ещё раз.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Service role bypasses RLS so guest (unauthenticated) orders are allowed.
  const admin = createAdminClient();

  const quote = await buildQuote(publishedPriceLookup(admin), lines, deliveryType);

  // Naming the offending lines is what lets the client prune them; the previous blanket message
  // left the customer retrying the same broken cart forever.
  if (quote.rejected.length > 0) {
    return { ok: false as const, error: "Часть товаров больше не доступна.", rejected: quote.rejected };
  }

  // The client showed a server quote before submitting. If prices moved in between, don't charge
  // silently — hand back the new quote and let the customer confirm it.
  if (quotedTotal != null && money(quotedTotal) !== quote.total) {
    return { ok: false as const, error: "Цены изменились, проверьте заказ.", quote };
  }

  const { items: orderItems, itemsTotal, deliveryCost, total } = quote;

  const { data, error } = await insertOrder(admin, {
    userId: user?.id,
    name: customerName,
    phone: customerPhone,
    address: customerAddress,
    comment: customerComment,
    items: orderItems,
    total,
    deliveryType,
    deliveryCost,
  });

  if (error || !data) return fail("Не удалось оформить заказ. Попробуйте ещё раз.");

  if (user?.id) {
    await admin.from("cart_items").delete().eq("user_id", user.id);
  }

  const { error: rpcError } = await admin.rpc("increment_product_purchase_counts", {
    items: orderItems.map((i) => ({ id: i.id, qty: i.quantity })),
  });
  if (rpcError) console.error("[checkout] purchase count RPC failed:", rpcError.message);

  // Only purchase_count changed, and that is a sort key for exactly two cached queries. Expiring
  // the shared "products" tag invalidated all nine — homepage, categories, brands, /new, /sale,
  // /popular, every product page — and updateTag has no stale-while-revalidate, so the next
  // visitor waited for a full re-fetch. Those entries carry revalidate: 60 anyway.
  updateTag("products-popular");

  const orderId = String(data.id);
  // The invoice used `new Date()`, evaluated inside after(), so the emailed document carried a
  // different timestamp than the one a re-download from the admin prints.
  const createdAt = data.created_at ? new Date(data.created_at) : new Date();
  const deliveryLabel = DELIVERY_OPTIONS.find((o) => o.id === deliveryType)!.label;

  // The invoice and the admin email must never block the confirmation — or fail it. The order
  // is already committed at this point, so an SMTP outage or a missing font would otherwise
  // surface to the customer as a failed checkout and get retried into a duplicate order.
  after(async () => {
    try {
      const invoicePdf = await generateInvoicePdf({
        orderId,
        createdAt,
        name: customerName,
        phone: customerPhone,
        address: customerAddress,
        comment: customerComment,
        deliveryLabel,
        deliveryCost,
        items: orderItems,
        itemsTotal,
        total,
      });
      const result = await sendNewOrderEmail(
        {
          orderId,
          name: customerName,
          phone: customerPhone,
          address: customerAddress,
          comment: customerComment,
          items: orderItems,
          itemsTotal,
          deliveryLabel,
          deliveryCost,
          total,
        },
        invoicePdf,
      );

      // Recorded so "which orders were never emailed?" is answerable, and visible in the admin
      // list. A failure here leaves notified_at NULL rather than pretending success.
      if (result.sent) await markOrderNotified(admin, Number(data.id));
      else console.error(`[checkout] order ${orderId} was NOT notified: ${result.reason}`);
    } catch (err) {
      console.error(`[checkout] post-order notification failed for order ${orderId}`, err);
    }
  });

  return { ok: true as const, orderId };
}
