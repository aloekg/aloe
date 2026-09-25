"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
      );

    if (!container.contains(document.activeElement)) {
      const initial = focusable()[0] ?? container;
      initial.focus({ preventScroll: true });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;

      // Both directions need the escaped check: a Suspense fallback unmounting can drop focus outside.
      const escaped = !container.contains(activeEl);

      if (e.shiftKey && (activeEl === first || escaped)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (activeEl === last || escaped)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);

      // Restore only to a connected opener, and only while focus is still inside.
      const stillInside = container.contains(document.activeElement);
      if (previouslyFocused?.isConnected && stillInside) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [ref, active]);
}
