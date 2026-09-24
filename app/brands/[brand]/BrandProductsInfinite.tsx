"use client";

import { useEffect, useRef, useState } from "react";
import ProductCard from "@/components/ProductCard";
import ProductGrid from "@/components/ProductGrid";
import type { ProductListItem } from "@/types";
import { loadMoreBrandProducts } from "./actions";
import { BRAND_PAGE_SIZE } from "./pagination";

type Props = {
  brandId: number;
  brandName: string;
  initialProducts: ProductListItem[];
  total: number;
};

export default function BrandProductsInfinite({ brandId, brandName, initialProducts, total }: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [loading, setLoading] = useState(false);
  const pageRef = useRef(1);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const exhausted = products.length >= total;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (loadingRef.current || pageRef.current * BRAND_PAGE_SIZE >= total) return;

        loadingRef.current = true;
        setLoading(true);
        const nextPage = pageRef.current + 1;
        loadMoreBrandProducts(brandId, nextPage)
          .then(({ products: more }) => {
            pageRef.current = nextPage;
            setProducts((prev) => [...prev, ...more]);
          })
          .catch((err) => {
            // Without this the loading flag stays set and infinite scroll dies silently
            // for the rest of the session.
            console.error("[brand] failed to load more products", err);
          })
          .finally(() => {
            loadingRef.current = false;
            setLoading(false);
          });
      },
      { rootMargin: "600px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [brandId, brandName, total]);

  return (
    <>
      <ProductGrid>
        {products.map((product, i) => (
          <ProductCard key={product.id} product={product} preload={i === 0} />
        ))}
      </ProductGrid>
      <div ref={sentinelRef} className="h-px" />
      {/* Cards appear below the fold with no sound at all otherwise. Always mounted, so the region
          exists before its first message — see components/Toaster.tsx for why that matters. */}
      <p role="status" aria-live="polite" className="text-center text-sm text-gray-500 py-4 empty:hidden">
        {loading ? "Загружаем ещё товары…" : exhausted && total > BRAND_PAGE_SIZE ? "Это все товары бренда" : ""}
      </p>
    </>
  );
}
