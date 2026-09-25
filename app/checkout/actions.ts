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

const LIMITS = { ...CONTACT_LIMITS, comment: 1000 } as const;

type Failure = { ok: false; error: string };

type CreateOrderResult =
  | { ok: true; orderId: string; token: string }
  | (Failure & { rejected?: RejectedLine[]; quote?: Quote });

function fail(error: string): Failure {
  return { ok: false, error };
}

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
  quotedTotal?: number;
}): Promise<CreateOrderResult> {
  if (!DELIVERY_OPTIONS.some((o) => o.id === deliveryType)) {
    return fail("Выберите способ доставки.");
  }

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

  // Service role: guest orders must be insertable without a session.
  const admin = createAdminClient();

  const quote = await buildQuote(publishedPriceLookup(admin), lines, deliveryType);

  if (quote.rejected.length > 0) {
    return { ok: false as const, error: "Часть товаров больше не доступна.", rejected: quote.rejected };
  }

  // After the rejected lines on purpose: the minimum applies only to goods that can be delivered.
  const shortfall = minOrderShortfall(quote.itemsTotal);
  if (shortfall > 0) {
    return fail(`Минимальная сумма заказа — ${MIN_ORDER_TOTAL} сом. Добавьте товаров ещё на ${shortfall} сом.`);
  }

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

  // purchase_count is deliberately not touched here: it follows the order status (app/admin/actions.ts).

  const orderId = String(data.id);
  // The DB timestamp, so the emailed invoice matches one re-downloaded from the admin.
  const createdAt = data.created_at ? new Date(data.created_at) : new Date();
  const deliveryLabel = DELIVERY_OPTIONS.find((o) => o.id === deliveryType)!.label;

  // Must never block or fail the confirmation: the order is committed, and a retry would duplicate it.
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

      if (result.sent) await markOrderNotified(admin, Number(data.id));
      else console.error(`[checkout] order ${orderId} was NOT notified: ${result.reason}`);
    } catch (err) {
      console.error(`[checkout] post-order notification failed for order ${orderId}`, err);
    }
  });

  return { ok: true as const, orderId, token: data.review_token };
}
