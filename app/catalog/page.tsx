import { ChevronRight } from "lucide-react";
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
];

export const metadata: Metadata = pageMetadata({
  title: "Каталог",
  description: "Каталог бытовой химии и косметики: все категории товаров интернет-магазина Aloe.kg.",
  path: "/catalog",
});

// Three across on a phone, more as the width allows, so a tile stays roughly the same size.
const GRID = "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 md:gap-3";

type CatalogCategory = { id: number; name: string; parent_id: number | null; slug: string; image_url?: string | null };

function Tile({
  href,
  label,
  image,
  preload,
}: {
  href: string;
  label: string;
  image?: string | null;
  preload?: boolean;
}) {
  return (
    <Link href={href} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
      {image ? (
        <>
          <Image
            src={image}
            alt={label}
            fill
            preload={preload}
            className="object-cover"
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 220px"
          />
          <div className="absolute inset-0 bg-black/25" />
          <span className="absolute top-1.5 left-1.5 right-1.5 md:top-2 md:left-2 md:right-2 text-xs md:text-sm font-medium text-white drop-shadow leading-tight line-clamp-3 hyphens-auto break-words">
            {label}
          </span>
        </>
      ) : (
        <span className="absolute top-1.5 left-1.5 right-1.5 md:top-2 md:left-2 md:right-2 text-xs md:text-sm font-medium text-gray-700 leading-tight line-clamp-4 hyphens-auto break-words">
          {label}
        </span>
      )}
    </Link>
  );
}

// Reads no searchParams so it prerenders; /catalog?q= is redirected in next.config.ts instead.
export default async function CatalogPage() {
  const allCategories = await getCachedCategories();
  const categories = allCategories as CatalogCategory[];
  const topCategories = categories.filter((c) => !c.parent_id);

  return (
    <>
      <MobileHeader>
        <HeaderSearchInput />
      </MobileHeader>
      <MainContainer>
        <Title className="sr-only md:not-sr-only md:mb-4">Каталог товаров</Title>
        <div className="space-y-5 md:space-y-8">
          <div className={GRID}>
            {/* `preload`: the first row is the LCP candidate, and `fill` images are lazy by default. */}
            {specials.map((s) => (
              <Tile key={s.href} href={s.href} label={s.label} image={s.image_url} preload />
            ))}
          </div>
          {topCategories.map((cat) => {
            const subcategories = categories.filter((c) => c.parent_id === cat.id);
            if (subcategories.length === 0) return null;
            return (
              <section key={cat.id} aria-labelledby={`catalog-${cat.id}`}>
                <h2 id={`catalog-${cat.id}`} className="mb-2 md:mb-3">
                  <Link
                    href={`/catalog/${cat.slug}`}
                    className="inline-flex items-center gap-0.5 text-base md:text-lg font-semibold hover:text-green-700"
                  >
                    {cat.name}
                    <ChevronRight className="w-4 h-4 text-gray-500" aria-hidden />
                  </Link>
                </h2>
                <div className={GRID}>
                  {subcategories.map((sub) => (
                    <Tile key={sub.id} href={`/catalog/${sub.slug}`} label={sub.name} image={sub.image_url} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </MainContainer>
    </>
  );
}
