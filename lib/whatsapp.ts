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

  // Written as an international number: take it at its word instead of reading a leading 8 or 0 as
  // a local trunk prefix. +82 2 123 4567 is ten digits and is not a Kyrgyz number.
  if (explicitlyInternational) {
    return digits.length >= 10 && digits.length <= 15 && !digits.startsWith("0") ? digits : null;
  }

  // `8` is the Soviet-era trunk prefix. Kyrgyzstan dials `0`, but customers who grew up on the old
  // convention still write it — either on its own or in front of the country code.
  if (digits.length === 13 && digits.startsWith("8996")) digits = digits.slice(1);

  if (digits.length === 9) return `996${digits}`; // 709272740
  if (digits.length === 10 && /^[08]/.test(digits)) return `996${digits.slice(1)}`; // 0505008085
  if (digits.length === 12 && digits.startsWith("996")) return digits; // 996 555 123 456

  // Anything else is a typo far more often than a foreign number typed without its `+`, and a
  // guess here opens a chat with a stranger. The row falls back to showing the phone as text.
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
  new: (o) => `Мы получили ваш заказ №${o.orderId} на сумму ${o.total} сом.`,
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
