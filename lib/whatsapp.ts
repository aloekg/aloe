import { ORDER_STATUS, SITE_URL } from "@/lib/constants";

// Return null rather than guess: a wrong number sends a customer's order details to a stranger.
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const explicitlyInternational = raw.trimStart().startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (explicitlyInternational) {
    return digits.length >= 10 && digits.length <= 15 && !digits.startsWith("0") ? digits : null;
  }

  if (digits.length === 13 && digits.startsWith("8996")) digits = digits.slice(1);

  if (digits.length === 9) return `996${digits}`;
  if (digits.length === 10 && /^[08]/.test(digits)) return `996${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("996")) return digits;

  return null;
}

export function whatsAppLink(phone: string | null | undefined, message?: string): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

type OrderMessage = {
  orderId: number;
  status: string;
  total: number;
  reviewToken?: string | null;
};

// Keyed by the same statuses as ORDER_STATUS.
const STATUS_MESSAGE: Record<string, (o: OrderMessage) => string> = {
  new: (o) => `Мы получили ваш заказ №${o.orderId} на сумму ${o.total} сом.`,
  confirmed: (o) => `Ваш заказ №${o.orderId} подтверждён, сумма к оплате — ${o.total} сом. Передаём его в доставку.`,
  processing: (o) => `Ваш заказ №${o.orderId} передан курьеру — он свяжется с вами перед доставкой.`,
  // The review link is the proof of purchase: it must go only to the customer's own number.
  delivered: (o) =>
    `Ваш заказ №${o.orderId} доставлен. Спасибо за покупку!` +
    (o.reviewToken ? `\n\nБудем рады отзыву — это займёт минуту: ${SITE_URL}/review/${o.reviewToken}` : ""),
  cancelled: (o) => `Ваш заказ №${o.orderId} отменён. Если это ошибка — напишите нам, оформим заново.`,
};

export function orderStatusMessage(order: OrderMessage): string {
  const body =
    STATUS_MESSAGE[order.status]?.(order) ??
    `По вашему заказу №${order.orderId}: ${ORDER_STATUS[order.status]?.label ?? order.status}.`;
  return `Здравствуйте! Это интернет-магазин Aloe.kg. ${body}`;
}
