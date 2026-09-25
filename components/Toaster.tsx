"use client";

import { CheckCircle, Info, XCircle } from "lucide-react";
import { useToast } from "@/store/toast";

export default function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const remove = useToast((s) => s.remove);
  const pause = useToast((s) => s.pause);
  const resume = useToast((s) => s.resume);

  // Always render the live region, even empty: one inserted with its first message is often not announced.
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
          onMouseEnter={() => pause(toast.id)}
          onMouseLeave={() => resume(toast.id)}
          onFocus={() => pause(toast.id)}
          onBlur={() => resume(toast.id)}
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
