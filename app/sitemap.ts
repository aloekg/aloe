import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import { loadAllPages } from "@/lib/db";
import { supabase } from "@/lib/supabase";

export const revalidate = 3600;

const STATIC_PAGES: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "/catalog", priority: 0.9, changeFrequency: "daily" },
  { path: "/brands", priority: 0.7, changeFrequency: "weekly" },
  { path: "/new", priority: 0.8, changeFrequency: "daily" },
  { path: "/sale", priority: 0.8, changeFrequency: "daily" },
  { path: "/popular", priority: 0.8, changeFrequency: "daily" },
  { path: "/delivery", priority: 0.4, changeFrequency: "monthly" },
  { path: "/about", priority: 0.4, changeFrequency: "monthly" },
  { path: "/contacts", priority: 0.4, changeFrequency: "monthly" },
  { path: "/legal-entities", priority: 0.3, changeFrequency: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // loadAllPages throws on a failed page: a silent empty one would publish a sitemap without products.
  const [categories, brands, products] = await Promise.all([
    loadAllPages("sitemap-categories", (from, to) =>
      supabase.from("categories").select("id, slug, parent_id").order("id").range(from, to),
    ),
    loadAllPages("sitemap-brands", (from, to) =>
      supabase.from("brands").select("id, slug").order("id").range(from, to),
    ),
    loadAllPages("sitemap-products", (from, to) =>
      supabase
        .from("products")
        .select("id, created_at, category_id, brand_id")
        .eq("published", true)
        .order("id")
        .range(from, to),
    ),
  ]);

  // Only entities with published products: their pages 404 otherwise.
  const productCategoryIds = new Set(products.map((p) => p.category_id).filter((id): id is number => id != null));
  const productBrandIds = new Set(products.map((p) => p.brand_id).filter((id): id is number => id != null));

  const childrenOf = new Map<number, number[]>();
  for (const c of categories) {
    if (c.parent_id != null) {
      if (!childrenOf.has(c.parent_id)) childrenOf.set(c.parent_id, []);
      childrenOf.get(c.parent_id)!.push(c.id);
    }
  }
  const hasProducts = (id: number): boolean =>
    productCategoryIds.has(id) || (childrenOf.get(id) ?? []).some(hasProducts);

  // Top-level only: sub-subcategories have no page, and ?sub= URLs duplicate their parent.
  const categoryUrls: MetadataRoute.Sitemap = categories
    .filter((c) => !c.parent_id && hasProducts(c.id))
    .map((c) => ({
      url: `${SITE_URL}/catalog/${c.slug}`,
      changeFrequency: "daily",
      priority: 0.8,
    }));

  const brandUrls: MetadataRoute.Sitemap = brands
    .filter((b) => productBrandIds.has(b.id))
    .map((b) => ({
      url: `${SITE_URL}/brands/${b.slug}`,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

  const productUrls: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${SITE_URL}/product/${p.id}`,
    lastModified: p.created_at ?? undefined,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const staticUrls: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  return [...staticUrls, ...categoryUrls, ...brandUrls, ...productUrls];
}
