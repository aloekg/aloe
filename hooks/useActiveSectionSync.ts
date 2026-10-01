"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeActiveSection } from "@/lib/active-section";

export function useActiveSectionSync(containerRef: React.RefObject<HTMLElement | null>) {
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const pillRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  useEffect(() => {
    return subscribeActiveSection((id) => {
      setActiveSectionId(id);
      if (id === null) return;
      const pill = pillRefs.current.get(id);
      const container = containerRef.current;
      if (!pill || !container) return;
      const pillLeft = pill.offsetLeft;
      const pillRight = pillLeft + pill.offsetWidth;
      const viewLeft = container.scrollLeft;
      const viewRight = viewLeft + container.offsetWidth;
      if (pillLeft < viewLeft || pillRight > viewRight) {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        container.scrollTo({
          left: pillLeft - container.offsetWidth / 2 + pill.offsetWidth / 2,
          behavior: reduced ? "auto" : "smooth",
        });
      }
    });
  }, [containerRef]);

  return { activeSectionId, pillRefs };
}
