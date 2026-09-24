"use client";

import { useCallback, useEffect, useState } from "react";
import Autoplay from "embla-carousel-autoplay";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
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

/**
 * Autoplay moves the banners on its own, which WCAG 2.2.2 (level A) allows only alongside a way to
 * stop it. The `stopOnMouseEnter` this used to rely on was never that way — it reaches a mouse and
 * nothing else, so a phone, a keyboard and a screen reader were all left watching content change
 * every four seconds with no recourse. Hence this button, which is always rendered, always
 * focusable, and the only thing that starts autoplay once it has stopped.
 *
 * It is a toggle whose *label* changes rather than an `aria-pressed` switch: "Остановить" and
 * "Возобновить" name the action the press performs, which is what a screen reader user needs here,
 * where "pressed"/"not pressed" says nothing about whether anything is moving.
 */
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
  // `playOnInit: false` because whether autoplay may run at all is a client-only question: the
  // server cannot know the visitor's motion preference, and reading it during render would make the
  // first client render disagree with the markup it is hydrating. The effect below starts it.
  //
  // No `stopOnMouseEnter`. It paused on hover and resumed on mouse-leave, so the toggle flipped
  // between ⏸ and ▶ as the cursor crossed a banner nobody had pressed anything on — a control
  // changing state on its own reads as a glitch, and it is worse than cosmetic: while
  // `stopOnInteraction` is false the plugin wires `mouseleave` and `focusout` straight to
  // `startAutoplay` with no check, so a deliberate pause was undone by moving the mouse off the
  // banner, or by tabbing past it. The mechanism WCAG 2.2.2 asks for cannot be revocable like that.
  //
  // With hover gone, the defaults are exactly right: `stopOnInteraction` (true) stops autoplay on a
  // swipe and registers neither resume listener, and `stopOnFocusIn` (true) stops it when focus
  // enters the carousel — deliberate, unlike a passing cursor, and it no longer restarts on the way
  // out. Only the toggle starts it again.
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
    // With one banner the plugin's own init bails out before it has anything to drive, so there is
    // nothing to start and no control to label.
    if (!emblaApi || !multiple) return;
    const autoplay = emblaApi.plugins().autoplay;
    if (!autoplay) return;

    const sync = () => setPlaying(autoplay.isPlaying());
    emblaApi.on("autoplay:play", sync).on("autoplay:stop", sync).on("reInit", sync);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!reduced.matches) autoplay.play();
    sync();

    // Turning the preference on mid-visit is a request for motion to stop now. The reverse does not
    // hold: turning it off is not a request to start moving, and must not undo a deliberate pause.
    const stopIfReduced = () => {
      if (reduced.matches) autoplay.stop();
    };
    reduced.addEventListener("change", stopIfReduced);

    return () => {
      reduced.removeEventListener("change", stopIfReduced);
      emblaApi.off("autoplay:play", sync).off("autoplay:stop", sync).off("reInit", sync);
    };
  }, [emblaApi, multiple]);

  /**
   * Hands control to the visitor: once they have steered, the carousel stops steering itself. The
   * plugin covers a swipe on its own, but the arrows and dots sit outside the drag container, so it
   * never sees those presses.
   */
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
            {/*
              Edge strips, not halves. These are invisible and used to be `w-1/2` each, so together
              they covered the banner end to end — and they sit above the <Link> that wraps the
              image, so a tap anywhere on a banner paged the carousel and its link was unreachable
              on a phone. `w-14` is 56px, comfortably past the 24px WCAG 2.5.8 asks of a target and
              past the ~44px that is comfortable in practice, and it leaves the middle — 208px even
              on a 320px screen — to the link.
            */}
            <Button onClick={scrollPrev} aria-label="Предыдущий баннер" className="absolute left-0 top-0 w-14 h-full" />
            <Button onClick={scrollNext} aria-label="Следующий баннер" className="absolute right-0 top-0 w-14 h-full" />
            {/* Right edge cleared for the toggle, which sits in the same strip. `pointer-events-none`
                because these bars are a readout, not a control: without it the bottom band of the
                banner swallowed taps meant for the link behind it. */}
            <div className="pointer-events-none absolute bottom-0 left-0 right-9 flex gap-1 px-2 pb-2">
              {banners.map((_, i) => (
                <div key={i} className="flex-1 h-1 rounded-full bg-white/40 overflow-hidden">
                  {i < selected && <div className="h-full w-full bg-green-700" />}
                  {/* Paused, the bar fills rather than freezing part-way: it then reads as "this is
                      the current banner" instead of as a timer that has stalled. */}
                  {i === selected &&
                    (playing ? (
                      <div key={selected} className="h-full bg-green-700 animate-banner-progress" />
                    ) : (
                      <div className="h-full w-full bg-green-700" />
                    ))}
                </div>
              ))}
            </div>
            {/* After the two edge strips in the DOM, so a tap in the corner reaches it, not them. */}
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
              {/* The dot is 8px; the button around it is 24px, the WCAG 2.5.8 minimum. */}
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
