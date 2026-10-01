"use client";

import { useState, useSyncExternalStore } from "react";
import { Share2 } from "lucide-react";
import Button from "@/components/Button";
import { useToast } from "@/store/toast";
import { fetchInvoiceFile } from "./invoice-file";

// canShare is true on macOS too, whose sheet has no WhatsApp; a coarse pointer rules desktops out.
const TOUCH_INPUT = "(pointer: coarse)";

let canShare: boolean | null = null;

// Probe with a real File: desktop Chrome exposes navigator.share but refuses files.
function canShareFiles(): boolean {
  if (canShare === null) {
    const probe = new File([new Uint8Array(1)], "probe.pdf", { type: "application/pdf" });
    canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
  }
  return canShare;
}

function subscribeToPointer(onChange: () => void) {
  const query = window.matchMedia(TOUCH_INPUT);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function canShareHere(): boolean {
  return canShareFiles() && window.matchMedia(TOUCH_INPUT).matches;
}

export default function ShareInvoiceButton({ orderId, revision }: { orderId: number; revision: string }) {
  const supported = useSyncExternalStore(subscribeToPointer, canShareHere, () => false);
  const [held, setHeld] = useState<{ revision: string; file: File } | null>(null);
  const [busy, setBusy] = useState(false);
  const show = useToast((s) => s.show);

  const file = held?.revision === revision ? held.file : null;

  if (!supported) return null;

  async function openSheet(pdf: File): Promise<boolean> {
    try {
      await navigator.share({ files: [pdf] });
      return true;
    } catch (err) {
      return err instanceof DOMException && err.name === "AbortError";
    }
  }

  async function handleClick() {
    if (file) {
      if (!(await openSheet(file))) show("Не удалось открыть отправку", "error");
      return;
    }

    setBusy(true);
    const pdf = await fetchInvoiceFile(orderId);
    setBusy(false);
    if (!pdf) {
      show("Не удалось собрать накладную", "error");
      return;
    }

    setHeld({ revision, file: pdf });
    // Safari spends the user activation during the fetch, so the PDF is kept for a second tap.
    if (!(await openSheet(pdf))) show("Нажмите ещё раз, чтобы отправить", "info");
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
    >
      <Share2 className="w-3.5 h-3.5" /> {busy ? "Готовим..." : "Поделиться накладной"}
    </Button>
  );
}
