import type { Metadata, Viewport } from "next";
import { Geist, Lobster } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { AuthSync, CategoryNav, Footer, Header, JsonLd, MobileBottomNav, Toaster } from "@/components";
import { getCachedCategories } from "@/lib/cached-queries";
import { BRAND_COLOR, SITE_URL } from "@/lib/constants";
import { IS_CANONICAL_HOST } from "@/lib/deploy-origin";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });
const lobster = Lobster({
  subsets: ["latin", "cyrillic"],
  weight: "400",
  variable: "--font-lobster",
});

const SITE_DESCRIPTION = "Интернет-магазин бытовой химии и косметики";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Everything below addresses the canonical domain even while this build is served from
  // new.aloe.kg — that is the point, the URLs have to be right on the day aloe.kg switches over.
  // The cost is that a non-canonical host serves pages advertising someone else's URLs, so it gets
  // an explicit noindex as well as the `disallow: /` in app/robots.ts. Two signals rather than
  // one: robots.txt alone still allows a URL-only index entry for a link discovered elsewhere.
  ...(IS_CANONICAL_HOST ? {} : { robots: { index: false, follow: false } }),
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
  // Gives iOS the standalone launch mode and the home screen label. `black-translucent` is
  // deliberately not used: it pulls content up under the status bar, which every page would then
  // have to pad around.
  appleWebApp: { capable: true, title: "Aloe.kg", statusBarStyle: "default" },
};

// themeColor belongs here rather than in `metadata`, where it has been deprecated since Next 14.
// `viewport-fit: cover` lets the floating bottom nav sit against the screen edge on a notched
// phone; app/globals.css pays for it with safe-area insets on body and on the nav itself.
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
};

export default async function RootLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  const categories = await getCachedCategories();

  return (
    <html lang="ru">
      <body className={`${geist.className} ${lobster.variable} min-h-screen flex flex-col`} suppressHydrationWarning>
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
        {modal}
      </body>
    </html>
  );
}
