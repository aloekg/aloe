"use client";

import { useEffect } from "react";
import { useActiveSectionSync } from "@/hooks/useActiveSectionSync";
import { useDragScroll } from "@/hooks/useDragScroll";
import { useWindowScrolled } from "@/hooks/useWindowScrolled";
import { scrollToSection } from "@/lib/section-scroll";
import { containerClassname } from "./Container";

type Subcategory = { id: number; name: string; slug: string };

export default function SubcategoryFilter({
  subcategories,
  leading,
}: {
  subcategories: Subcategory[];
  leading?: React.ReactNode;
}) {
  const { ref, handlers, onClickCapture } = useDragScroll<HTMLDivElement>();
  const { activeSectionId, pillRefs } = useActiveSectionSync(ref);
  const scrolled = useWindowScrolled();

  // history.replaceState, not router.replace: the router would re-render the server on every scroll tick.
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

  // The scroller must stay `relative`: useActiveSectionSync compares the pills' offsetLeft with its scrollLeft.

  return (
    <div className="sticky top-15 md:top-41.5 z-10 bg-white">
      <div className={`${containerClassname} py-2`}>
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
