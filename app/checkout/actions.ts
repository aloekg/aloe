"use server";

import { after } from "next/server";
import { DELIVERY_OPTIONS, MIN_ORDER_TOTAL } from "@/lib/constants";
import { generateInvoicePdf } from "@/lib/invoice";
import { sendNewOrderEmail } from "@/lib/mailer";
import { buildQuote, minOrderShortfall, money, parseLines, publishedPriceLookup } from "@/lib/order-pricing";
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

  // Checked after the rejected lines, not before: the minimum is about the goods that can actually
  // be delivered, so a cart that only clears 500 сом thanks to a product just taken off sale is
  // below it. The customer prunes those first and sees the real total.
  const shortfall = minOrderShortfall(quote.itemsTotal);
  if (shortfall > 0) {
    return fail(`Минимальная сумма заказа — ${MIN_ORDER_TOTAL} сом. Добавьте товаров ещё на ${shortfall} сом.`);
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

  // purchase_count is deliberately NOT touched here any more. Checkout records an intent — there is
  // no payment gate, and a fifth of production orders end up cancelled — so the counter that ranks
  // "Популярные" follows the order's status instead, from app/admin/actions.ts. See
  // `purchaseCountDelta` in lib/constants.ts and the 20260923120000 migration.

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
