"use client";

import { useState } from "react";
import { Truck } from "lucide-react";
import DeliveryContent from "./DeliveryContent";
import Sheet from "./Sheet";

/**
 * The header's delivery-info dialog. It used to carry its own backdrop, scroll lock, focus trap and
 * Escape listener — a second copy of what `Sheet` does, and one that knew nothing about the sheet
 * stack (lib/sheet-stack.ts). One dialog component, one set of rules.
 */
export default function DeliveryModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 text-gray-500 hover:text-green-700 transition-colors cursor-pointer"
        aria-label="Доставка и оплата"
        title="Доставка"
      >
        <Truck className="size-5" aria-hidden />
      </button>

      {open && (
        <Sheet heading="Доставка и оплата" onClose={() => setOpen(false)} width="max-w-xl">
          <div className="px-4 pb-4">
            <DeliveryContent compact />
          </div>
        </Sheet>
      )}
    </>
  );
}
