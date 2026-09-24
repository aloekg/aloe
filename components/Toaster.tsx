"use client";

import { CheckCircle, Info, XCircle } from "lucide-react";
import { useToast } from "@/store/toast";

export default function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const remove = useToast((s) => s.remove);

  // The container is rendered even with nothing in it. It used to return null while empty, which
  // meant the live region entered the DOM at the same moment as its first message — and a region
  // inserted together with its content is routinely missed, because screen readers watch regions
  // that already exist for changes. So "Добавлено в корзину" was announced only sometimes.
  // `pointer-events-none` keeps the now-permanent element from covering anything; each toast turns
  // pointers back on for itself.
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 md:top-auto md:bottom-6 md:left-auto md:translate-x-0 md:right-6 z-50 flex flex-col gap-2 items-center md:items-end pointer-events-none"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => remove(toast.id)}
          aria-label={`${toast.message}. Закрыть`}
          className={`pointer-events-auto
            flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
            cursor-pointer max-w-xs animate-slide-up
            ${toast.type === "success" ? "bg-green-700 text-white" : ""}
            ${toast.type === "error" ? "bg-red-600 text-white" : ""}
            ${toast.type === "info" ? "bg-gray-800 text-white" : ""}
          `}
        >
          {toast.type === "success" && <CheckCircle className="size-4 shrink-0 mt-px" />}
          {toast.type === "error" && <XCircle className="size-4 shrink-0 mt-px" />}
          {toast.type === "info" && <Info className="size-4 shrink-0 mt-px" />}
          <span className="text-left">{toast.message}</span>
        </button>
      ))}
    </div>
  );
}
