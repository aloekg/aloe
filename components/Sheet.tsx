"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useFocusTrap } from "@/hooks/useFocusTrap";

/**
 * Mirrors the `duration-300` below. A caller usually unmounts this component from `onClose` (the
 * product quick view navigates back), so the exit has to finish before that happens — nothing else
 * keeps the panel on screen.
 */
const TRANSITION_MS = 300;

type Props = {
  children: React.ReactNode;
  /** Runs once the exit animation has finished — unmount or navigate from here, not before. */
  onClose: () => void;
  /** Names the dialog for screen readers; rendered as its visually hidden heading. */
  label: string;
  /** Pin the panel to its maximum height instead of sizing it to the content. */
  fullHeight?: boolean;
  /** Width of the panel, as a Tailwind `max-w-*`. */
  width?: string;
  /**
   * Set to true to dismiss the sheet from outside — it plays the same exit as a tap on the
   * backdrop and then calls `onClose`. Unmounting the sheet directly would skip the animation.
   */
  requestClose?: boolean;
};

/**
 * A bottom sheet on a phone, a centred dialog from `md` up. Mounted means open: the panel animates
 * in on mount and out through `close()`, which is the only way it should be dismissed.
 *
 * The panel transitions `translate`/`scale`, not `transform`: Tailwind 4 compiles `translate-y-*`
 * and `scale-*` to those standalone CSS properties, so `transition-[transform,…]` would name a
 * property nothing here animates and the sheet would appear with no movement at all.
 */
export default function Sheet({
  children,
  onClose,
  label,
  fullHeight = false,
  width = "max-w-3xl",
  requestClose = false,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const closing = useRef(false);
  const exitTimer = useRef<number | undefined>(undefined);

  useBodyScrollLock(true);
  useFocusTrap(panelRef);

  // Two frames, not one: the first paints the off-screen state, the second transitions away from
  // it. Flipped inside a single rAF the browser folds both into one style pass and the sheet just
  // appears, already open.
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setOpen(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  // A browser Back can unmount us mid-exit; the pending timer would then fire `onClose` into a
  // component that is already gone.
  useEffect(() => () => window.clearTimeout(exitTimer.current), []);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setOpen(false);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    exitTimer.current = window.setTimeout(onClose, reduced ? 0 : TRANSITION_MS);
  }, [onClose]);

  useEffect(() => {
    if (requestClose) close();
  }, [requestClose, close]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={close}>
      <div
        aria-hidden
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex flex-col bg-white rounded-t-2xl md:rounded-b-2xl shadow-xl w-full ${width} ${
          fullHeight ? "h-[95dvh] md:h-[90vh]" : "max-h-[95dvh] md:max-h-[90vh]"
        } overflow-hidden transition-[translate,scale,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
          open
            ? "translate-y-0 md:opacity-100 md:scale-100"
            : "translate-y-full md:translate-y-0 md:opacity-0 md:scale-95"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="sr-only">
          {label}
        </h2>
        <div className="w-full absolute top-0 left-0 z-10 flex bg-white p-2">
          <button
            onClick={close}
            className="ml-auto p-1.5 text-gray-500 hover:text-gray-600 transition-colors cursor-pointer"
            aria-label="Закрыть"
            title="Закрыть"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto scrollbar-none pt-12">{children}</div>
      </div>
    </div>
  );
}
