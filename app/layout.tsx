import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Geist, Lobster } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { AuthModal, AuthSync, CategoryNav, Footer, Header, JsonLd, MobileBottomNav, Toaster } from "@/components";
import { getCachedCategories } from "@/lib/cached-queries";
import { BRAND_COLOR, SITE_URL, WHATSAPP_LINK, WHATSAPP_NUMBER } from "@/lib/constants";
import { IS_CANONICAL_HOST } from "@/lib/deploy-origin";
import "./globals.css";

// `cyrillic` named so next/font preloads it; `variable` is what Tailwind's font-sans resolves to.
const geist = Geist({ subsets: ["latin", "cyrillic"], variable: "--font-geist-sans" });
const lobster = Lobster({
  subsets: ["cyrillic"],
  weight: "400",
  variable: "--font-lobster",
});

const SITE_DESCRIPTION = "Интернет-магазин бытовой химии и косметики";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // A non-canonical host gets noindex in addition to the disallow in app/robots.ts.
  ...(IS_CANONICAL_HOST ? {} : { robots: { index: false, follow: false } }),
  // Search Console ownership tag for aloe.kg; removing it loses the property.
  verification: { google: "d0YIirmB5tX_do99ES_OLfJoMkW9gltVw4WnyeRQ8n8" },
  title: { default: "Aloe.kg — бытовая химия и косметика в Бишкеке", template: "%s — Aloe.kg" },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Aloe.kg",
    url: SITE_URL,
    title: "Aloe.kg",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: "Aloe.kg",
    description: SITE_DESCRIPTION,
  },
  appleWebApp: { capable: true, title: "Aloe.kg", statusBarStyle: "default" },
};

// viewport-fit cover relies on the safe-area insets in app/globals.css.
export const viewport: Viewport = {
  themeColor: BRAND_COLOR,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Aloe.kg",
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/search?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Aloe.kg",
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
  description: SITE_DESCRIPTION,
  telephone: WHATSAPP_NUMBER,
  areaServed: { "@type": "City", name: "Бишкек" },
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer service",
    telephone: WHATSAPP_NUMBER,
    availableLanguage: ["ru", "ky"],
  },
  sameAs: [WHATSAPP_LINK],
};

export default async function RootLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  const categories = await getCachedCategories();

  return (
    <html lang="ru">
      <body
        className={`${geist.className} ${geist.variable} ${lobster.variable} min-h-screen flex flex-col`}
        suppressHydrationWarning
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg focus:outline-2 focus:outline-green-600"
        >
          Перейти к содержимому
        </a>
        <JsonLd data={websiteJsonLd} />
        <JsonLd data={organizationJsonLd} />
        <NextTopLoader color={BRAND_COLOR} showSpinner={false} />
        <AuthSync />
        <Header className="hidden md:block" />
        <CategoryNav categories={categories} />
        {children}
        <Footer />
        <MobileBottomNav />
        <Toaster />
        <AuthModal />
        {modal}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
