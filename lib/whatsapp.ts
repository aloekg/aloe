/**
 * wa.me links for the admin order list: opens a chat with the customer with the message for the
 * order's current status already typed in. Nothing is sent automatically — the admin still presses
 * send, and can edit the text first.
 *
 * Deliberately not the WhatsApp Business API: registering a number there takes it out of the
 * regular WhatsApp app, and `WHATSAPP_NUMBER` is the shop's only channel — consultations, wallet
 * payments and the regions delivery quote all happen in that same chat by hand.
 */

import { ORDER_STATUS } from "@/lib/constants";

/**
 * `customer_phone` is free text: checkout only requires nine digits somewhere in it
 * (`app/checkout/actions.ts`), so the column holds `+996 555 …`, `0555 …` and `555 …` alike — the
 * same spread `customerKey()` in lib/analytics.ts has to reconcile. wa.me wants bare international
 * digits with no `+`.
 *
 * Returns null rather than a guess when the number is neither recognisably Kyrgyz nor written in
 * international form. A wrong number here opens a chat with a stranger and puts a customer's order
 * details into it, which is worse than showing no link at all.
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const explicitlyInternational = raw.trimStart().startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.length === 9) return `996${digits}`; // 555 123 456
  if (digits.length === 10 && digits.startsWith("0")) return `996${digits.slice(1)}`; // 0555 123 456
  if (digits.length === 12 && digits.startsWith("996")) return digits; // +996 555 123 456

  // A foreign number is trusted only when it was actually written as one. A bare 11-digit string is
  // far more likely to be a mistyped local number than a Russian or Kazakh one.
  if (explicitlyInternational && digits.length >= 10 && digits.length <= 15) return digits;

  return null;
}

/** null when the phone is unusable, so the caller can fall back to showing it as plain text. */
export function whatsAppLink(phone: string | null | undefined, message?: string): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

type OrderMessage = { orderId: number; status: string; total: number };

/**
 * A first line the admin can send as-is, not a finished script — it is prefilled into the chat and
 * meant to be adjusted. Keyed by the same statuses as `ORDER_STATUS`.
 */
const STATUS_MESSAGE: Record<string, (o: OrderMessage) => string> = {
  new: (o) => `Мы получили ваш заказ №${o.orderId} на сумму ${o.total} сом. Подтвердите, пожалуйста, состав и адрес.`,
  confirmed: (o) => `Ваш заказ №${o.orderId} подтверждён, сумма к оплате — ${o.total} сом. Передаём его в доставку.`,
  processing: (o) => `Ваш заказ №${o.orderId} передан курьеру — он свяжется с вами перед доставкой.`,
  delivered: (o) => `Ваш заказ №${o.orderId} доставлен. Спасибо за покупку!`,
  cancelled: (o) => `Ваш заказ №${o.orderId} отменён. Если это ошибка — напишите нам, оформим заново.`,
};

export function orderStatusMessage(order: OrderMessage): string {
  const body =
    STATUS_MESSAGE[order.status]?.(order) ??
    // An unknown status is still worth a chat — the admin writes the rest themselves.
    `По вашему заказу №${order.orderId}: ${ORDER_STATUS[order.status]?.label ?? order.status}.`;
  return `Здравствуйте! Это интернет-магазин Aloe.kg. ${body}`;
}
