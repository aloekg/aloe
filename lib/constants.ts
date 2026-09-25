export const SITE_URL = "https://aloe.kg";

export const LEGACY_SITE_URL = "https://old.aloe.kg";

// Pinned to production's storage on purpose: staging reads these tiles from production's bucket.
export const SPECIALS_BASE_URL =
  "https://ukgtmxzpzprmoutqskgq.supabase.co/storage/v1/object/public/categories/specials";

export const WHATSAPP_NUMBER = "+996 556 400 656";
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, "")}`;

// Mirrors Tailwind's green-600.
export const BRAND_COLOR = "#16a34a";

// cls sets text and background together for contrast; render sites must not add their own text-*.
export const LABEL_MAP = {
  new: { text: "Новинка", cls: "bg-blue-100 text-blue-800" },
  sale: { text: "Акция", cls: "bg-orange-100 text-orange-800" },
} as const;

export const FREE_DELIVERY_THRESHOLD = 10000;

export const MIN_ORDER_TOTAL = 500;

export const DELIVERY_OPTIONS = [
  {
    id: "center",
    label: "По центру города Бишкек, микрорайоны, Восток 5, Джал, мкр Кок-жар",
    cost: 200,
    freeOverThreshold: true,
  },
  {
    id: "residential",
    label: "Жилмассивы (Чон-Арык, Арча Бешик, Ак орго, Ак ордо, Новопавловка, Тунгуч, Аламедин-1)",
    cost: 300,
    freeOverThreshold: false,
  },
  {
    id: "regions",
    label: "Доставка в регионы (сумма доставки обговаривается по телефону)",
    cost: 0,
    freeOverThreshold: false,
  },
  {
    id: "urgent",
    label: "Мне срочно, отправьте Яндексом, оплачу за доставку курьеру сам",
    cost: 0,
    freeOverThreshold: false,
  },
] as const;

export type DeliveryOptionId = (typeof DELIVERY_OPTIONS)[number]["id"];

export function getDeliveryCost(id: string, orderTotal: number): number {
  const option = DELIVERY_OPTIONS.find((o) => o.id === id);
  if (!option) return 0;
  if (option.freeOverThreshold && orderTotal >= FREE_DELIVERY_THRESHOLD) return 0;
  return option.cost;
}

// PLACEHOLDER: legal default, not the shop's stated terms; published on /delivery and in product JSON-LD.
export const RETURN_WINDOW_DAYS = 14;

export const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "Новый", cls: "bg-blue-100 text-blue-700" },
  confirmed: { label: "Подтверждён", cls: "bg-yellow-100 text-yellow-700" },
  processing: { label: "В доставке", cls: "bg-orange-100 text-orange-700" },
  delivered: { label: "Доставлен", cls: "bg-green-100 text-green-700" },
  cancelled: { label: "Отменён", cls: "bg-red-100 text-red-700" },
};

// `new` is excluded on purpose: an unconfirmed order must not count towards purchase_count.
const PURCHASED_STATUSES = new Set(["confirmed", "processing", "delivered"]);

export function countsAsPurchase(status: string | null | undefined): boolean {
  return PURCHASED_STATUSES.has(status ?? "");
}

export function purchaseCountDelta(prev: string | null | undefined, next: string | null | undefined): 1 | 0 | -1 {
  const was = countsAsPurchase(prev);
  const is = countsAsPurchase(next);
  if (was === is) return 0;
  return is ? 1 : -1;
}

export function deliveryFreeNote(id: string | null): string {
  if (id === "regions") return "по договорённости";
  if (id === "urgent") return "оплата курьеру";
  return "бесплатно";
}
