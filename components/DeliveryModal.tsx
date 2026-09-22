"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Truck, X } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import DeliveryContent from "./DeliveryContent";

export default function DeliveryModal() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useBodyScrollLock(open);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 text-gray-500 hover:text-green-700 transition-colors cursor-pointer"
        aria-label="Доставка и оплата"
        title="Доставка"
      >
        <Truck className="size-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 id={titleId} className="text-lg font-semibold text-gray-900">
                Доставка и оплата
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-gray-500 hover:text-gray-600 transition-colors"
                aria-label="Закрыть"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="px-4">
              <DeliveryContent compact />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
