import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import HeaderSearchInput from "@/components/header/HeaderSearchInput";
import MainContainer from "@/components/MainContainer";
import MobileHeader from "@/components/MobileHeader";
import Title from "@/components/Title";
import { getCachedCategories } from "@/lib/cached-queries";
import { SPECIALS_BASE_URL } from "@/lib/constants";
import { pageMetadata } from "@/lib/seo";

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

// Reads no searchParams so it prerenders; /catalog?q= is redirected in next.config.ts instead.
export default async function CatalogPage() {
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
          {/* `preload`: these are the LCP candidate, and `fill` images are lazy by default. */}
          {specials.map((s) => (
            <Link key={s.href} href={s.href} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
              {s.image_url && (
                <Image
                  src={s.image_url}
                  alt={s.label}
                  fill
                  preload
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
