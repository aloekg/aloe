"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useIsClient } from "@/hooks/useIsClient";
import { isTopSheet, popSheet, pushSheet, subscribeSheetStack } from "@/lib/sheet-stack";

// Mirrors `duration-300` below; onClose must wait for the exit to finish.
const TRANSITION_MS = 300;

type Props = {
  children: React.ReactNode;
  // Runs after the exit animation: unmount or navigate from here, not before.
  onClose: () => void;
  fullHeight?: boolean;
  width?: string;
  // Dismiss from outside through this; unmounting the sheet directly skips the exit animation.
  requestClose?: boolean;
} & (
  | {
      heading: string;
      label?: never;
    }
  | {
      label: string;
      heading?: never;
    }
);

// Transition `translate`/`scale`, not `transform`: Tailwind 4 compiles them to standalone properties.
// The portal is required: a sticky z-indexed ancestor would trap `z-50` under MobileBottomNav.
export default function Sheet({
  children,
  onClose,
  label,
  heading,
  fullHeight = false,
  width = "max-w-3xl",
  requestClose = false,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const closing = useRef(false);
  const exitTimer = useRef<number | undefined>(undefined);

  const isTop = useSyncExternalStore(
    subscribeSheetStack,
    () => isTopSheet(titleId),
    () => true,
  );
  useEffect(() => {
    pushSheet(titleId);
    return () => popSheet(titleId);
  }, [titleId]);

  useBodyScrollLock(true);
  useFocusTrap(panelRef, isTop);

  // Two frames, not one: a single rAF folds both states into one style pass and skips the animation.
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
    if (!isTop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, isTop]);

  const isClient = useIsClient();
  if (!isClient) return null;

  // The header row is absolute over the content; `pt-12` on the content clears it.
  return createPortal(
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      inert={!isTop || undefined}
    >
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
      >
        <div className="w-full absolute top-0 left-0 z-10 flex items-center gap-3 bg-white py-2 pl-4 pr-2">
          {heading ? (
            <h2 id={titleId} className="text-base font-semibold truncate">
              {heading}
            </h2>
          ) : (
            <h2 id={titleId} className="sr-only">
              {label}
            </h2>
          )}
          <button
            onClick={close}
            className="ml-auto shrink-0 p-1.5 text-gray-500 hover:text-gray-600 transition-colors cursor-pointer"
            aria-label="Закрыть"
            title="Закрыть"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto scrollbar-none pt-12 safe-area-pb md:pb-0">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
