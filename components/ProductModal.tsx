"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export default function ProductModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = useCallback(() => router.back(), [router]);

  useBodyScrollLock(true);
  useFocusTrap(panelRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={close}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex flex-col bg-white rounded-t-2xl md:rounded-b-2xl shadow-xl w-full max-w-3xl max-h-[95vh] md:max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="sr-only">
          Быстрый просмотр товара
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
        <div className="flex-1 h-full w-full overflow-y-auto scrollbar-none pt-12">{children}</div>
      </div>
    </div>
  );
}
