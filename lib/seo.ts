import type { Metadata } from "next";

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
