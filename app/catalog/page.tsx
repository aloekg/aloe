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
  { href: "/brands", label: "Бренды", image_url: `${SPECIALS_BASE_URL}/brands.webp` },
];

export const metadata: Metadata = pageMetadata({
  title: "Каталог",
  description: "Каталог бытовой химии и косметики: все категории товаров интернет-магазина Aloe.kg.",
  path: "/catalog",
});

type CatalogCategory = { id: number; name: string; parent_id: number | null; slug: string; image_url?: string | null };

function MobileTile({
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
          <Image src={image} alt={label} fill preload={preload} className="object-cover" sizes="33vw" />
          <div className="absolute inset-0 bg-black/25" />
          <span className="absolute top-1.5 left-1.5 right-1.5 text-xs font-medium text-white drop-shadow leading-tight line-clamp-3 hyphens-auto break-words">
            {label}
          </span>
        </>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs font-medium text-gray-700 leading-tight hyphens-auto break-words">
          <span className="line-clamp-4">{label}</span>
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
        <div className="md:hidden space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {specials
              .filter((s) => s.href !== "/brands")
              .map((s) => (
                <MobileTile key={s.href} href={s.href} label={s.label} image={s.image_url} preload />
              ))}
          </div>
          {topCategories.map((cat) => {
            const subcategories = categories.filter((c) => c.parent_id === cat.id);
            if (subcategories.length === 0) return null;
            return (
              <section key={cat.id} aria-labelledby={`catalog-${cat.id}`}>
                <h2 id={`catalog-${cat.id}`} className="mb-2">
                  <Link
                    href={`/catalog/${cat.slug}`}
                    className="inline-flex items-center gap-0.5 text-base font-semibold"
                  >
                    {cat.name}
                    <ChevronRight className="w-4 h-4 text-gray-500" aria-hidden />
                  </Link>
                </h2>
                <div className="grid grid-cols-3 gap-2">
                  {subcategories.map((sub) => (
                    <MobileTile
                      key={sub.id}
                      href={`/catalog/${cat.slug}?sub=${sub.slug}`}
                      label={sub.name}
                      image={sub.image_url}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <div className="hidden md:grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
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
