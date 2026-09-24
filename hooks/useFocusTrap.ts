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

/**
 * Keeps Tab inside an overlay and returns focus to whatever opened it. Without this a keyboard
 * user tabs straight through the backdrop into the page behind, with no way to tell they left.
 */
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

    // Move focus in so the first Tab lands inside rather than at the top of the document — unless
    // it is already inside, as it is when a sheet regains the top after the one above it closed and
    // handed focus back to the heart that opened it.
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

      // Both directions need the escaped-focus check. Only Shift+Tab had it, so once focus left
      // the overlay a forward Tab walked into the page behind the backdrop — which happens
      // routinely, because the modal's Suspense fallback unmounts and restores focus outside.
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

      // Only restore if the opener is still in the document and focus is still ours to move.
      // Calling focus() on a detached node is a no-op that silently drops focus to <body>, and
      // stealing it back would fight a user who has deliberately moved on. AdminDrawer hits this:
      // saving re-renders the row whose button opened it.
      const stillInside = container.contains(document.activeElement);
      if (previouslyFocused?.isConnected && stillInside) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [ref, active]);
}
