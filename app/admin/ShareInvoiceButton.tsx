"use client";

import { useState, useSyncExternalStore } from "react";
import { Share2 } from "lucide-react";
import Button from "@/components/Button";
import { useToast } from "@/store/toast";
import { fetchInvoiceFile } from "./invoice-file";

/**
 * A desktop share sheet accepts the file and then offers no WhatsApp to give it to, so the button
 * is pointless there — and `canShare` alone does not rule it out: macOS hands back `true`. The
 * primary pointer does: a phone or tablet is coarse, a mouse is not.
 */
const TOUCH_INPUT = "(pointer: coarse)";

let canShare: boolean | null = null;

/**
 * Asked of the browser rather than inferred from the user agent: desktop Chrome exposes
 * `navigator.share` but refuses files, so the probe has to be an actual File. Cached per page load
 * — `useSyncExternalStore` reads the snapshot on every render, and this answer never moves.
 */
function canShareFiles(): boolean {
  if (canShare === null) {
    const probe = new File([new Uint8Array(1)], "probe.pdf", { type: "application/pdf" });
    canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
  }
  return canShare;
}

/** The pointer can change under a running page — a tablet gains a mouse, a phone gains a keyboard. */
function subscribeToPointer(onChange: () => void) {
  const query = window.matchMedia(TOUCH_INPUT);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function canShareHere(): boolean {
  return canShareFiles() && window.matchMedia(TOUCH_INPUT).matches;
}

/**
 * Hands the invoice PDF to the phone's share sheet, where WhatsApp is one of the targets.
 *
 * This exists because a `wa.me` link cannot carry a file — no URL parameter attaches one — so short
 * of the WhatsApp Business API this is the only way to get the document into a chat. It stays a
 * two-step action on purpose: the sheet picks the app and the chat, and the admin presses send.
 */
export default function ShareInvoiceButton({ orderId, revision }: { orderId: number; revision: string }) {
  // Server-rendered as false, so the markup matches and the button appears once the client knows.
  const supported = useSyncExternalStore(subscribeToPointer, canShareHere, () => false);
  const [held, setHeld] = useState<{ revision: string; file: File } | null>(null);
  const [busy, setBusy] = useState(false);
  const show = useToast((s) => s.show);

  // Derived rather than cleared from an effect: an edit in either editor reprints the invoice, and
  // a stale revision simply stops matching, so the next tap re-fetches instead of sending the
  // superseded document.
  const file = held?.revision === revision ? held.file : null;

  if (!supported) return null;

  /** Distinguishes "the admin closed the sheet" from "the sheet never opened". */
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
    // Generating the PDF takes a server round trip, and Safari counts the user activation as spent
    // by the time it resolves — the first tap then fails with nothing shown. The document is kept,
    // so the next tap opens the sheet immediately on a fresh gesture.
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
