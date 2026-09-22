export const SITE_URL = "https://aloe.kg";

/**
 * The previous shop (Joomla + JoomShopping). It served aloe.kg until this site replaced it and
 * stays online at this subdomain, so customers who relied on it are not cut off mid-transition.
 * Old product links on the main domain are 301d instead — see app/catalog/product/view/[...path].
 */
export const LEGACY_SITE_URL = "https://old.aloe.kg";

/**
 * Where the four fixed /catalog tiles live (Популярное, Новинки, Акции, Бренды). They are artwork,
 * not rows — there is no category to hang an `image_url` on — so the path is written down.
 *
 * Pinned to production's storage origin rather than derived from NEXT_PUBLIC_SUPABASE_URL, which
 * looks like a bug and is not. Staging runs its own database but reads product photos straight out
 * of these same public buckets, and its catalogue seed copies rows, never objects — so
 * `categories/specials/` exists in exactly one project. Deriving the origin would leave staging
 * with four broken tiles and gain nothing.
 */
export const SPECIALS_BASE_URL =
  "https://ukgtmxzpzprmoutqskgq.supabase.co/storage/v1/object/public/categories/specials";

/** The shop's only contact channel — WhatsApp. Read by the contacts page and the Organization JSON-LD. */
export const WHATSAPP_NUMBER = "+996 556 400 656";
/** wa.me wants the number without spaces or a leading plus. */
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, "")}`;

/** The green everything brand-coloured keys off — matches Tailwind's green-600. */
export const BRAND_COLOR = "#16a34a";

/**
 * `cls` carries the text colour as well as the background, because neither can be chosen alone.
 * The badge text is 10px, so WCAG counts it as normal text and wants 4.5:1, and the vivid fills
 * this started as gave white only 3.76:1 (blue-500) and 2.89:1 (orange-500).
 *
 * Both of the ways to fix that while keeping a saturated fill were tried and rejected on looks:
 * near-black text on the same fills reads as a warning sticker rather than a badge, and white on a
 * fill dark enough to carry it (orange-700, #ca3500) is no longer orange. The tint inverts the
 * problem instead — the colour moves into the text, where it has the whole white card to sit
 * against — and clears the bar with the most room of anything measured, 7.25:1 and 6.41:1.
 *
 * The cost is deliberate: a pale badge draws less attention than a solid one. If "Акция" turns out
 * to need more presence on a grid, `border border-orange-200` defines its edge without touching
 * the text contrast. Render sites must not add a `text-*` of their own.
 */
export const LABEL_MAP = {
  new: { text: "Новинка", cls: "bg-blue-100 text-blue-800" },
  sale: { text: "Акция", cls: "bg-orange-100 text-orange-800" },
} as const;

export const FREE_DELIVERY_THRESHOLD = 10000;

/**
 * The smallest basket the shop accepts, in сом, counted on the goods alone — delivery is what the
 * threshold pays for, so letting it top the basket up would defeat the point. The number is not new:
 * `DeliveryContent` has promised "при заказе от 500 сом" since the old site, and until now nothing
 * enforced it.
 */
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

/**
 * PLACEHOLDER — the legal default, not a policy the shop has stated. Nothing on the old site or the
 * new one describes returns, so this is article 25 of the KR consumer-protection act for
 * non-food goods of proper quality: 14 days, return shipping on the buyer. It is published on
 * /delivery and in every product's JSON-LD (Google's merchant-listing report asks for
 * hasMerchantReturnPolicy), which makes it a public commitment — replace both the number and the
 * wording as soon as the owner says what the real terms are.
 *
 * Cosmetics and household chemicals are on the non-returnable list in several neighbouring
 * jurisdictions; if that applies here too, this whole block goes and the markup says
 * MerchantReturnNotPermitted instead.
 */
export const RETURN_WINDOW_DAYS = 14;

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
