"use client";

import { useCallback, useEffect, useState } from "react";
import Autoplay from "embla-carousel-autoplay";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import Button from "./Button";

type Banner = Pick<import("@/types").Banner, "id" | "image_url" | "link">;

/**
 * The homepage renders the desktop set and the mobile set and hides one with CSS — and a hidden
 * `<img>` is still downloaded: `loading="lazy"` only defers images the browser can place relative
 * to the viewport, and one inside `display:none` has no box at all, so Chrome fetches it straight
 * away. The September 2026 Lighthouse run caught what that costs on a phone: the desktop creative
 * (58 KB) started at 0.9 s, ahead of the stylesheet, while the banner the visitor could actually
 * see — the LCP element — did not start until 2.7 s, for an LCP of 5.6 s.
 *
 * So each image is scoped to its own breakpoint with `<picture>`: `<source media>` is the one
 * mechanism that makes the *browser* choose, and the fallback `<img src>` is a 43-byte transparent
 * pixel, which is what the other breakpoint downloads instead of a banner. The first slide is then
 * `eager` + `fetchpriority="high"`, so the preload scanner starts it from the HTML rather than
 * after hydration.
 *
 * A `<link rel=preload>` (what next/image's `preload`, née `priority`, emits) would undo exactly
 * that: it fires regardless of media, so it would fetch both sets again. This is the "multiple
 * images could be the LCP depending on the viewport" case the next/image docs send to
 * `fetchPriority` instead. And next/image buys nothing here anyway — `images.unoptimized` is on —
 * so these are plain tags.
 */

/**
 * The exact complement of Tailwind's `md` (48rem) — the breakpoint app/page.tsx hides each set
 * with. Range syntax rather than `max-width: 47.999rem` so there is no fractional-pixel width at
 * which a set is visible but its <source> does not match; it is also what Tailwind 4 itself emits.
 */
const BANNER_MEDIA = {
  mobile: "(width < 48rem)",
  desktop: "(width >= 48rem)",
} as const;

/** 1×1 transparent GIF: inline, so it costs no request, and `img-src data:` is already in the CSP. */
const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function BannerImage({ banner, index, media }: { banner: Banner; index: number; media: keyof typeof BANNER_MEDIA }) {
  const first = index === 0;
  return (
    <picture>
      <source media={BANNER_MEDIA[media]} srcSet={banner.image_url} />
      {/* Plain <img>: next/image cannot emit a <source media> sibling — see the note above. */}
      <img
        src={TRANSPARENT_PIXEL}
        alt={`Баннер ${index + 1}`}
        className="absolute inset-0 size-full object-cover"
        loading={first ? "eager" : "lazy"}
        fetchPriority={first ? "high" : undefined}
        decoding="async"
      />
    </picture>
  );
}

export default function BannerCarousel({
  banners,
  media,
}: {
  banners: Banner[];
  /** Which breakpoint this instance is the visible one at — see BANNER_MEDIA. */
  media: keyof typeof BANNER_MEDIA;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [
    Autoplay({ delay: 4000, stopOnMouseEnter: true, stopOnInteraction: false }),
  ]);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((i: number) => emblaApi?.scrollTo(i), [emblaApi]);

  if (banners.length === 0) return null;

  return (
    <div className="relative w-full h-full overflow-hidden md:rounded-xl lg:rounded-2xl aspect-5/2 md:aspect-6/1">
      <div ref={emblaRef} className="h-full overflow-hidden">
        <div className="flex h-full">
          {banners.map((b, i) => (
            <div key={b.id} className="relative flex-[0_0_100%] h-full">
              {b.link ? (
                <Link href={b.link} className="block w-full h-full">
                  <BannerImage banner={b} index={i} media={media} />
                </Link>
              ) : (
                <BannerImage banner={b} index={i} media={media} />
              )}
            </div>
          ))}
        </div>
      </div>

      {banners.length > 1 && (
        <>
          <div className="md:hidden">
            <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none" />
            <Button
              onClick={scrollPrev}
              aria-label="Предыдущий баннер"
              className="absolute left-0 top-0 w-1/2 h-full"
            />
            <Button
              onClick={scrollNext}
              aria-label="Следующий баннер"
              className="absolute right-0 top-0 w-1/2 h-full"
            />
            <div className="absolute bottom-0 left-0 right-0 flex gap-1 px-2 pb-2">
              {banners.map((_, i) => (
                <div key={i} className="flex-1 h-1 rounded-full bg-white/40 overflow-hidden">
                  {i < selected && <div className="h-full w-full bg-green-600" />}
                  {i === selected && <div key={selected} className="h-full bg-green-600 animate-banner-progress" />}
                </div>
              ))}
            </div>
          </div>

          <div className="hidden md:block">
            <Button
              onClick={scrollPrev}
              aria-label="Предыдущий баннер"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              onClick={scrollNext}
              aria-label="Следующий баннер"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors"
            >
              <ChevronRight className="size-4" />
            </Button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {banners.map((_, i) => (
                <Button
                  key={i}
                  onClick={() => scrollTo(i)}
                  aria-label={`Баннер ${i + 1} из ${banners.length}`}
                  aria-current={i === selected ? "true" : undefined}
                  className={`h-2 rounded-full transition-all ${i === selected ? "bg-white w-4" : "bg-white/50 w-2"}`}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
