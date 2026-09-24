"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a CSS media query currently matches. `false` on the server and during hydration — the
 * server cannot know the viewport, and a first client render that disagreed with the markup would
 * be a hydration mismatch — then the real answer from the first effect on, and live on resize.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
