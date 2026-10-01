"use client";

import { useEffect, useRef, type RefObject } from "react";

export function useOutsideClick(ref: RefObject<HTMLElement | null>, onOutside: () => void, active = true) {
  // Held in a ref so a changing callback does not re-register the listener on every keystroke.
  const handler = useRef(onOutside);
  useEffect(() => {
    handler.current = onOutside;
  }, [onOutside]);

  useEffect(() => {
    if (!active) return;

    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) handler.current();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [ref, active]);
}
