"use client";

import { useCallback, useEffect, useState } from "react";
import Autoplay from "embla-carousel-autoplay";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import Link from "next/link";
import Button from "./Button";

type Banner = Pick<import("@/types").Banner, "id" | "image_url" | "link" | "alt">;

// Must stay the exact complement of Tailwind's `md`, which app/page.tsx hides each set with.
const BANNER_MEDIA = {
  mobile: "(width < 48rem)",
  desktop: "(width >= 48rem)",
} as const;

const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function AutoplayToggle({
  playing,
  onToggle,
  className,
}: {
  playing: boolean;
  onToggle: () => void;
  className: string;
}) {
  const Icon = playing ? Pause : Play;
  const label = playing ? "Остановить смену баннеров" : "Возобновить смену баннеров";
  return (
    <Button
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={`absolute z-10 flex items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 ${className}`}
    >
      <Icon className="size-3.5" fill="currentColor" />
    </Button>
  );
}

function BannerImage({ banner, index, media }: { banner: Banner; index: number; media: keyof typeof BANNER_MEDIA }) {
  const first = index === 0;
  return (
    <picture>
      <source media={BANNER_MEDIA[media]} srcSet={banner.image_url} />
      {/* Plain <img> in <picture>: a hidden <img> still downloads, and a preload would fetch both sets. */}
      <img
        src={TRANSPARENT_PIXEL}
        alt={banner.alt?.trim() || `Баннер ${index + 1}`}
        className="absolute inset-0 size-full object-cover"
        loading={first ? "eager" : "lazy"}
        fetchPriority={first ? "high" : undefined}
        decoding="async"
      />
    </picture>
  );
}

export default function BannerCarousel({ banners, media }: { banners: Banner[]; media: keyof typeof BANNER_MEDIA }) {
  // playOnInit false: motion preference is client-only, the effect starts it. No stopOnMouseEnter:
  // the plugin would resume on mouseleave/focusout and undo a deliberate pause.
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [Autoplay({ delay: 4000, playOnInit: false })]);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const multiple = banners.length > 1;

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi || !multiple) return;
    const autoplay = emblaApi.plugins().autoplay;
    if (!autoplay) return;

    const sync = () => setPlaying(autoplay.isPlaying());
    emblaApi.on("autoplay:play", sync).on("autoplay:stop", sync).on("reInit", sync);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!reduced.matches) autoplay.play();
    sync();

    const stopIfReduced = () => {
      if (reduced.matches) autoplay.stop();
    };
    reduced.addEventListener("change", stopIfReduced);

    return () => {
      reduced.removeEventListener("change", stopIfReduced);
      emblaApi.off("autoplay:play", sync).off("autoplay:stop", sync).off("reInit", sync);
    };
  }, [emblaApi, multiple]);

  // Arrows and dots sit outside the drag container, so the plugin never sees those presses.
  const stopAutoplay = useCallback(() => emblaApi?.plugins().autoplay?.stop(), [emblaApi]);

  const scrollPrev = useCallback(() => {
    stopAutoplay();
    emblaApi?.scrollPrev();
  }, [emblaApi, stopAutoplay]);
  const scrollNext = useCallback(() => {
    stopAutoplay();
    emblaApi?.scrollNext();
  }, [emblaApi, stopAutoplay]);
  const scrollTo = useCallback(
    (i: number) => {
      stopAutoplay();
      emblaApi?.scrollTo(i);
    },
    [emblaApi, stopAutoplay],
  );
  const toggleAutoplay = useCallback(() => {
    const autoplay = emblaApi?.plugins().autoplay;
    if (!autoplay) return;
    if (autoplay.isPlaying()) autoplay.stop();
    else autoplay.play();
  }, [emblaApi]);

  if (banners.length === 0) return null;

  return (
    <div
      className="relative w-full h-full overflow-hidden md:rounded-xl lg:rounded-2xl aspect-5/2 md:aspect-6/1"
      role="region"
      aria-roledescription="карусель"
      aria-label="Акции и новости"
    >
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
            {/* Edge strips, not halves: they sit above the banner's <Link>. */}
            <Button onClick={scrollPrev} aria-label="Предыдущий баннер" className="absolute left-0 top-0 w-14 h-full" />
            <Button onClick={scrollNext} aria-label="Следующий баннер" className="absolute right-0 top-0 w-14 h-full" />
            {/* pointer-events-none: this band sits above the banner's link. */}
            <div className="pointer-events-none absolute bottom-0 left-0 right-9 flex gap-1 px-2 pb-2">
              {banners.map((_, i) => (
                <div key={i} className="flex-1 h-1 rounded-full bg-white/40 overflow-hidden">
                  {i < selected && <div className="h-full w-full bg-green-700" />}
                  {i === selected &&
                    (playing ? (
                      <div key={selected} className="h-full bg-green-700 animate-banner-progress" />
                    ) : (
                      <div className="h-full w-full bg-green-700" />
                    ))}
                </div>
              ))}
            </div>
            {/* Must come after the edge strips in the DOM so it receives taps in the corner. */}
            <AutoplayToggle playing={playing} onToggle={toggleAutoplay} className="bottom-1 right-1.5 size-7" />
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
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex">
              {banners.map((_, i) => (
                <Button
                  key={i}
                  onClick={() => scrollTo(i)}
                  aria-label={`Баннер ${i + 1} из ${banners.length}`}
                  aria-current={i === selected ? "true" : undefined}
                  className="flex h-6 min-w-6 items-center justify-center px-1"
                >
                  <span
                    aria-hidden
                    className={`block h-2 rounded-full transition-all ${i === selected ? "bg-white w-4" : "bg-white/50 w-2"}`}
                  />
                </Button>
              ))}
            </div>
            <AutoplayToggle playing={playing} onToggle={toggleAutoplay} className="bottom-2.5 right-3 size-7" />
          </div>
        </>
      )}
    </div>
  );
}
