"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { ProductListItem } from "@/types";
import Button from "./Button";
import ProductCard from "./ProductCard";
import SeeAllProducts from "./SeeAllProducts";

/** Tailwind's `md`. Embla exists for the arrows, and the arrows exist from here up. */
const DESKTOP = "(min-width: 48rem)";

/**
 * A row of cards. From `md` up it is an Embla carousel with arrows; below that it is a plain
 * `overflow-x: auto` row the phone scrolls natively.
 *
 * Embla is not attached on a phone on purpose. The arrows are `hidden md:flex`, so all it did there
 * was reimplement the swipe the browser already does — with a pointer listener, a resize observer
 * and a layout measurement of every slide, seventeen times over on the home page, on the device
 * least able to afford it. Native scrolling is also the better swipe: momentum, rubber-banding and
 * the scrollbar gesture all come from the platform. What the customer sees does not change.
 */
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

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold">{title}</h2>
        {hiddenCount > 0 && seeAllHref && <SeeAllProducts href={seeAllHref} count={hiddenCount} />}
      </div>

      <div className="relative">
        {/* The ref is what initialises Embla; withheld below md, this is just a scrolling div. A
            desktop window narrowed past md hands Embla a null node, which destroys the instance and
            clears the inline styles it set, so the row falls back to native scrolling in place. */}
        <div ref={desktop ? emblaRef : undefined} className="overflow-x-auto md:overflow-hidden scrollbar-hide">
          {/*
            No card is preloaded here, deliberately. The homepage stacks fourteen of these, so
            `preload` on the first card of each emitted fourteen <link rel=preload>s into <head> —
            190 KB of off-screen thumbnails that the browser fetched ahead of the stylesheet, the
            JS chunks and the banner that actually is the LCP element. The one card near the fold
            gains nothing from a preload anyway: it is in the viewport, so it loads on layout.
          */}
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
