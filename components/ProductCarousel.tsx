"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { ProductListItem } from "@/types";
import Button from "./Button";
import ProductCard from "./ProductCard";
import SeeAllProducts from "./SeeAllProducts";

// Tailwind's `md`, where the arrows appear.
const DESKTOP = "(min-width: 48rem)";

export default function ProductCarousel({
  title,
  href: seeAllHref,
  products,
  totalCount,
  visibleCount = 4,
}: {
  title: string;
  href?: string;
  products: ProductListItem[];
  totalCount?: number;
  visibleCount?: number;
}) {
  const desktop = useMediaQuery(DESKTOP);
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    dragFree: true,
    slidesToScroll: visibleCount,
  });
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      setCanScrollPrev(emblaApi.canScrollPrev());
      setCanScrollNext(emblaApi.canScrollNext());
    };
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const hiddenCount = Math.max(0, (totalCount ?? products.length) - visibleCount);

  // Embla's ref is withheld below md on purpose: the phone scrolls natively.
  // No card is preloaded: the home page stacks many carousels and each preload would jump the LCP banner.

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold">{title}</h2>
        {hiddenCount > 0 && seeAllHref && <SeeAllProducts href={seeAllHref} count={hiddenCount} />}
      </div>

      <div className="relative">
        <div ref={desktop ? emblaRef : undefined} className="overflow-x-auto md:overflow-hidden scrollbar-hide">
          <div className="grid grid-flow-col auto-cols-[minmax(160px,220px)] gap-3">
            {products.map((p) => (
              <div key={p.id}>
                <ProductCard product={p} className="h-full" />
              </div>
            ))}
          </div>
        </div>

        {canScrollPrev && (
          <Button
            onClick={scrollPrev}
            aria-label="Назад"
            className="hidden md:flex absolute left-0 top-16 -translate-x-1/2 w-9 h-9 rounded-full bg-white shadow-md border border-gray-200 items-center justify-center text-gray-700 hover:bg-gray-50 transition-colors z-10"
          >
            <ChevronLeft className="size-5" />
          </Button>
        )}
        {canScrollNext && (
          <Button
            onClick={scrollNext}
            aria-label="Вперёд"
            className="hidden md:flex absolute right-0 top-16 translate-x-1/2 w-9 h-9 rounded-full bg-white shadow-md border border-gray-200 items-center justify-center text-gray-700 hover:bg-gray-50 transition-colors z-10"
          >
            <ChevronRight className="size-5" />
          </Button>
        )}
      </div>
    </section>
  );
}
