export const SITE_URL = "https://aloe.kg";

/**
 * The previous shop (Joomla + JoomShopping). It served aloe.kg until this site replaced it and
 * stays online at this subdomain, so customers who relied on it are not cut off mid-transition.
 * Old product links on the main domain are 301d instead — see app/catalog/product/view/[...path].
 */
export const LEGACY_SITE_URL = "https://old.aloe.kg";

/** The green everything brand-coloured keys off — matches Tailwind's green-600. */
export const BRAND_COLOR = "#16a34a";

export const LABEL_MAP = {
  new: { text: "Новинка", cls: "bg-blue-500" },
  sale: { text: "Акция", cls: "bg-orange-500" },
} as const;

export const FREE_DELIVERY_THRESHOLD = 10000;

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

export const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "Новый", cls: "bg-blue-100 text-blue-700" },
  confirmed: { label: "Подтверждён", cls: "bg-yellow-100 text-yellow-700" },
  processing: { label: "В доставке", cls: "bg-orange-100 text-orange-700" },
  delivered: { label: "Доставлен", cls: "bg-green-100 text-green-700" },
  cancelled: { label: "Отменён", cls: "bg-red-100 text-red-700" },
};

/**
 * What a zero `delivery_cost` means depends on which option was chosen: the two city zones can be
 * free over the threshold, but "regions" is quoted by phone and "urgent" is settled with the
 * courier — printing "бесплатно" for those would promise something the shop never agreed to.
 */
export function deliveryFreeNote(id: string | null): string {
  if (id === "regions") return "по договорённости";
  if (id === "urgent") return "оплата курьеру";
  return "бесплатно";
}
