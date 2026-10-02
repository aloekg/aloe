"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

type Option<T extends string> = { value: T; label: string };

type TriggerProps = {
  ref: React.RefObject<HTMLButtonElement | null>;
  expanded: boolean;
  controls: string;
  onClick: () => void;
};

// Portalled and `fixed`, not absolute under the trigger: the trigger sits in the pill row's
// horizontal scroller, whose overflow would clip it. It closes on any scroll rather than following.
export default function SortMenu<T extends string>({
  options,
  value,
  onSelect,
  label,
  renderTrigger,
}: {
  options: Option<T>[];
  value: T;
  onSelect: (value: T) => void;
  label: string;
  renderTrigger: (props: TriggerProps) => React.ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = pos != null;
  const menuId = useId();

  const hide = (refocus: boolean) => {
    setPos(null);
    if (refocus) triggerRef.current?.focus();
  };

  const toggle = () => {
    if (open) return hide(false);
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left });
  };

  // Keep it on screen once its width is known: the trigger can sit near the right edge on /search.
  useLayoutEffect(() => {
    if (!pos || !menuRef.current) return;
    const max = window.innerWidth - menuRef.current.offsetWidth - 8;
    if (pos.left > max) setPos({ top: pos.top, left: Math.max(8, max) });
  }, [pos]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      // The click that dismisses the menu does nothing else, as with a native <select> — otherwise
      // closing it over the grid opens the quick view of whichever card was under the pointer.
      const swallow = (click: MouseEvent) => {
        click.preventDefault();
        click.stopPropagation();
      };
      document.addEventListener("click", swallow, { capture: true, once: true });
      // A drag or a scroll produces no click; drop the listener before it eats an unrelated one.
      window.setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 600);
      hide(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide(true);
    };
    // Capture, so a scroll of the pill row counts too — the menu would be left pointing at nothing.
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) hide(false);
    };
    const onResize = () => hide(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      items[(i + step + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") {
      hide(false);
    }
  };

  return (
    <>
      {renderTrigger({ ref: triggerRef, expanded: open, controls: menuId, onClick: toggle })}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            tabIndex={-1}
            aria-label={label}
            onKeyDown={onMenuKey}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-50 min-w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={o.value === value}
                onClick={() => {
                  onSelect(o.value);
                  hide(true);
                }}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors cursor-pointer focus:outline-none focus-visible:bg-gray-100 ${
                  o.value === value ? "text-green-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {o.label}
                {o.value === value && <Check className="size-4 shrink-0" aria-hidden />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
