"use client";

import { useEffect } from "react";
import { useActiveSectionSync } from "@/hooks/useActiveSectionSync";
import { useDragScroll } from "@/hooks/useDragScroll";
import { useWindowScrolled } from "@/hooks/useWindowScrolled";
import { scrollToSection } from "@/lib/section-scroll";
import { containerClassname } from "./Container";

type Subcategory = { id: number; name: string; slug: string };

/**
 * The sticky subcategory pills, and on a phone the two filter triggers at the head of the same row.
 *
 * Below `md` the pills are **always one scrollable row**. They used to wrap into as many rows as
 * they needed until the page was scrolled, which on a phone meant a category with a dozen
 * subcategories opened with three rows of pills between the header and the first product, then
 * collapsed to one the moment you moved — a layout shift on the busiest page of the site, in the
 * direction that hides the goods. From `md` up the width is there, so the wrap-until-scrolled
 * behaviour stays.
 */
export default function SubcategoryFilter({
  subcategories,
  leading,
}: {
  subcategories: Subcategory[];
  /** Rendered as the first items of the row, scrolling sideways with the pills. */
  leading?: React.ReactNode;
}) {
  const { ref, handlers, onClickCapture } = useDragScroll<HTMLDivElement>();
  const { activeSectionId, pillRefs } = useActiveSectionSync(ref);
  const scrolled = useWindowScrolled();

  // Reflects the scrolled-to subcategory in the URL via the History API directly (not
  // next/navigation's router) so the address bar stays shareable/bookmarkable without
  // triggering a server re-render on every section change while scrolling.
  useEffect(() => {
    if (activeSectionId == null) return;
    const active = subcategories.find((s) => s.id === activeSectionId);
    if (!active) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("sub") === active.slug) return;
    params.set("sub", active.slug);
    window.history.replaceState(window.history.state, "", `?${params.toString()}`);
  }, [activeSectionId, subcategories]);

  if (subcategories.length === 0 && !leading) return null;

  return (
    <div className="sticky top-15 md:top-41.5 z-10 bg-white">
      <div className={`${containerClassname} py-2`}>
        {/* `relative` makes this the offsetParent of the pills, so the offsetLeft that
            useActiveSectionSync compares against scrollLeft is measured in the same coordinate
            space. Without it both are read from the sticky wrapper and differ by the container's
            padding — plus, now, the width of `leading`, which scrolls along with everything else. */}
        <div
          ref={ref}
          className={`relative flex items-center gap-2 flex-nowrap overflow-x-auto scrollbar-none ${
            scrolled ? "md:flex-nowrap md:overflow-x-auto" : "md:flex-wrap md:overflow-x-visible"
          }`}
          {...handlers}
          onClickCapture={onClickCapture}
        >
          {leading}
          {subcategories.map((s) => (
            <button
              key={s.id}
              ref={(el) => {
                if (el) pillRefs.current.set(s.id, el);
                else pillRefs.current.delete(s.id);
              }}
              onClick={() => scrollToSection(s.id)}
              aria-pressed={s.id === activeSectionId}
              className={`px-4 py-2 text-xs rounded-full border transition-colors whitespace-nowrap cursor-pointer ${
                s.id === activeSectionId
                  ? "bg-gray-700 text-white border-gray-700"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
