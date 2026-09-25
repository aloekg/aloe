import type { Metadata } from "next";
import { DELIVERY_OPTIONS, RETURN_WINDOW_DAYS, SITE_URL, type DeliveryOptionId } from "@/lib/constants";

// Keep openGraph here: Next merges it with the root layout's rather than deriving it from title/description.
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

// One entry at the highest city rate; "regions"/"urgent" have no rate and a 0 would advertise free delivery.
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

// Placeholder terms (see RETURN_WINDOW_DAYS); must match the "Возврат товара" section of DeliveryContent.
export const MERCHANT_RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "KG",
  returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
  merchantReturnDays: RETURN_WINDOW_DAYS,
  returnMethod: "https://schema.org/ReturnByMail",
  returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
  merchantReturnLink: `${SITE_URL}/delivery#returns`,
};
