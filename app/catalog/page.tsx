import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import HeaderSearchInput from "@/components/header/HeaderSearchInput";
import MainContainer from "@/components/MainContainer";
import MobileHeader from "@/components/MobileHeader";
import Title from "@/components/Title";
import { getCachedCategories } from "@/lib/cached-queries";
import { pageMetadata } from "@/lib/seo";

const SPECIALS_BASE_URL = "https://dnlburbuchxzxdmhuczu.supabase.co/storage/v1/object/public/categories/specials";

const specials: Array<{ href: string; label: string; image_url?: string | null }> = [
  { href: "/popular", label: "Популярное", image_url: `${SPECIALS_BASE_URL}/popular.webp` },
  { href: "/new", label: "Новинки", image_url: `${SPECIALS_BASE_URL}/new.webp` },
  { href: "/sale", label: "Акции", image_url: `${SPECIALS_BASE_URL}/sale.webp` },
  { href: "/brands", label: "Бренды", image_url: `${SPECIALS_BASE_URL}/brands.webp` },
];

export const metadata: Metadata = pageMetadata({
  title: "Каталог",
  description: "Каталог бытовой химии и косметики: все категории товаров интернет-магазина Aloe.kg.",
  path: "/catalog",
});

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; brand?: string | string[] }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";

  // /catalog?q= used to be a second copy of the search results, reachable only from the field that
  // lived in this page's mobile header. That field now suggests products in a dropdown and submits
  // to /search, like the one on the home page, so nothing produces these URLs any more — old links
  // and history entries are sent to the one results page rather than rendering a duplicate of it.
  if (q) {
    const params = new URLSearchParams({ q });
    if (sp.page) params.set("page", sp.page);
    const brands = Array.isArray(sp.brand) ? sp.brand : sp.brand ? [sp.brand] : [];
    for (const brand of brands) params.append("brand", brand);
    redirect(`/search?${params}`);
  }

  const allCategories = await getCachedCategories();
  const topCategories = (
    allCategories as Array<{
      id: number;
      name: string;
      parent_id: number | null;
      slug: string;
      image_url?: string | null;
    }>
  ).filter((c) => !c.parent_id);

  return (
    <>
      <MobileHeader>
        <HeaderSearchInput />
      </MobileHeader>
      <MainContainer>
        <Title className="sr-only md:not-sr-only md:mb-4">Каталог товаров</Title>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
          {specials.map((s) => (
            <Link key={s.href} href={s.href} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
              {s.image_url && (
                <Image
                  src={s.image_url}
                  alt={s.label}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 50vw, 300px"
                />
              )}
              <div className="absolute inset-0 bg-black/25" />
              <span className="absolute top-2 left-2 text-xs font-medium text-white drop-shadow leading-tight max-w-[calc(100%-1rem)]">
                {s.label}
              </span>
            </Link>
          ))}
          {topCategories.map((cat) => (
            <Link
              key={cat.id}
              href={`/catalog/${cat.slug}`}
              className="relative aspect-square rounded-xl overflow-hidden bg-gray-100"
            >
              {cat.image_url && (
                <Image
                  src={cat.image_url}
                  alt={cat.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 50vw, 300px"
                />
              )}
              <div className="absolute inset-0 bg-black/25" />
              <span className="absolute top-2 left-2 text-xs font-medium text-white drop-shadow leading-tight max-w-[calc(100%-1rem)]">
                {cat.name}
              </span>
            </Link>
          ))}
        </div>
      </MainContainer>
    </>
  );
}
