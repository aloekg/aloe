"use client";

import { useEffect, useState } from "react";

export function useWindowScrolled(threshold = 1) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > threshold);
    }
    // Initial read: a reload or back-navigation mid-page must not start as unscrolled.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return scrolled;
}
