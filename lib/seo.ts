import type { Metadata } from "next";
import { DELIVERY_OPTIONS, RETURN_WINDOW_DAYS, SITE_URL, type DeliveryOptionId } from "@/lib/constants";

/**
 * The three tags a page kept forgetting one of: its own canonical, its own description, and its own
 * Open Graph block.
 *
 * The OG block matters more than it looks. Next merges `openGraph` with the root layout's rather
 * than deriving it from the page's `title`/`description`, so a page that omits it advertises the
 * home page's name and URL — every category, brand and promo link shared in WhatsApp previewed
 * identically as "Aloe.kg — Интернет-магазин бытовой химии и косметики", which is most of how this
 * shop actually gets shared.
 *
 * `path` is relative on purpose: `metadataBase` (SITE_URL) resolves it, so nothing here has to know
 * which host the build is served from.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
  };
}

/**
 * The `shippingDetails` block Google's merchant-listing report asks every Offer for, derived from
 * the delivery tariff in lib/constants.ts so the markup cannot drift from what checkout charges.
 *
 * One entry, not one per zone. A `DefinedRegion` cannot name a Bishkek microdistrict — its finest
 * grain is a postal code, which this tariff does not go by — so two rates would both come out
 * addressed to "Бишкек" and read as a duplicate rather than a choice. The rate quoted is therefore
 * the highest of the city zones: overstating it can only ever surprise a customer in their favour,
 * where quoting 200 would understate what a жилмассив actually pays.
 *
 * "regions" and "urgent" are excluded for a related reason — one is quoted by phone, the other paid
 * to the courier, so neither has a rate to state, and a 0 would advertise free delivery countrywide.
 * The free-over-FREE_DELIVERY_THRESHOLD case is left out too: `shippingRate` is the standing rate.
 *
 * Times come from DeliveryContent: orders are taken around the clock, processed 10:00–18:00 and
 * delivered by arrangement the same or the next day, with Monday closed.
 */
const CITY_ZONES: readonly DeliveryOptionId[] = ["center", "residential"];

const cityShippingRate = Math.max(
  ...DELIVERY_OPTIONS.filter((option) => CITY_ZONES.includes(option.id)).map((option) => option.cost),
);

export const OFFER_SHIPPING_DETAILS = {
  "@type": "OfferShippingDetails",
  shippingRate: { "@type": "MonetaryAmount", value: cityShippingRate, currency: "KGS" },
  shippingDestination: { "@type": "DefinedRegion", addressCountry: "KG", addressRegion: "Бишкек" },
  deliveryTime: {
    "@type": "ShippingDeliveryTime",
    handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
    transitTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
    cutoffTime: "18:00:00+06:00",
    businessDays: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "https://schema.org/Tuesday",
        "https://schema.org/Wednesday",
        "https://schema.org/Thursday",
        "https://schema.org/Friday",
        "https://schema.org/Saturday",
        "https://schema.org/Sunday",
      ],
    },
  },
};

/**
 * `hasMerchantReturnPolicy`, the other half of what the merchant-listing report asks an Offer for.
 *
 * Every value here is the placeholder described on RETURN_WINDOW_DAYS — see that comment before
 * changing anything: this is markup the shop is publicly held to, and the owner has not yet said
 * what the real terms are. `returnMethod` in particular is a guess; there is no storefront to
 * return to, so the goods come back the way they went out.
 *
 * ReturnFeesCustomerResponsibility rather than ReturnShippingFees deliberately — the latter
 * requires a `returnShippingFeesAmount`, and no fixed figure exists to put there.
 */
export const MERCHANT_RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "KG",
  returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
  merchantReturnDays: RETURN_WINDOW_DAYS,
  returnMethod: "https://schema.org/ReturnByMail",
  returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
  merchantReturnLink: `${SITE_URL}/delivery#returns`,
};
