"use client";

import { useState, useSyncExternalStore } from "react";
import { Ellipsis, Share, SquarePlus, X } from "lucide-react";
import Button from "@/components/Button";
import { cn } from "@/lib/cn";

const DISMISSED_KEY = "install-hint-dismissed";
const STANDALONE = "(display-mode: standalone)";

/**
 * Chrome, Firefox and Edge on iOS do have "Добавить на экран «Домой»", but not where these steps
 * say to look, and an in-app browser (Instagram, Facebook) has no such item at all. Showing them
 * instructions that do not match what they see is worse than showing nothing.
 */
const NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line\//;

let iosSafari: boolean | null = null;

/**
 * The one place in this codebase that reads the user agent, and it is unavoidable: "show the iOS
 * instructions" is not a capability a browser can be asked about. iPadOS 13+ reports itself as a
 * Macintosh, so the touch points are what tell an iPad from a real Mac.
 */
function isIosSafari(): boolean {
  if (iosSafari === null) {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPod/.test(ua) || (/iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    iosSafari = ios && !NOT_SAFARI.test(ua);
  }
  return iosSafari;
}

/** `display-mode` is the standard; `navigator.standalone` is what iOS actually sets. */
function isInstalled(): boolean {
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia(STANDALONE).matches || legacy === true;
}

function applies(): boolean {
  return isIosSafari() && !isInstalled();
}

/** Launching the installed app makes this true, and the hint should disappear behind it. */
function subscribeToDisplayMode(onChange: () => void) {
  const query = window.matchMedia(STANDALONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const STEPS = [
  { icon: Ellipsis, before: "Нажмите", strong: "«...»", after: "рядом с адресной строкой" },
  { icon: Share, before: "Выберите", strong: "«Поделиться»", after: "" },
  { icon: SquarePlus, before: "Выберите", strong: "«На экран „Домой“»", after: "" },
  { icon: null, before: "Нажмите", strong: "«Добавить»", after: "в правом верхнем углу" },
];

/**
 * Tells an iPhone visitor how to install the shop, because iOS has no install API at all — Safari
 * offers nothing to call, so the only thing a site can do is describe the share sheet. Android is
 * deliberately not handled here: there the browser fires `beforeinstallprompt` and the right answer
 * is a button, not a set of steps.
 */
export default function InstallAppIos({ className }: { className?: string }) {
  // Rendered as nothing on the server, so the hint appears only once the client has looked.
  const show = useSyncExternalStore(subscribeToDisplayMode, applies, () => false);
  const [dismissed, setDismissed] = useState(() => {
    // The initialiser runs during SSR too, and in a private window the read itself throws.
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (!show || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Private mode: hidden for this page, back on the next one. Better than crashing the page.
    }
  }

  return (
    <div className={cn("relative rounded-xl border border-green-200 bg-green-50 p-4", className)}>
      <Button
        variant="icon"
        size="sm"
        onClick={dismiss}
        aria-label="Скрыть подсказку"
        className="absolute right-1 top-1 text-gray-400 hover:bg-green-100 hover:text-gray-600"
      >
        <X className="w-4 h-4" />
      </Button>

      <p className="pr-7 font-semibold text-gray-900">Установите Aloe.kg на телефон</p>
      <p className="mt-1 text-sm text-gray-600">
        Магазин откроется как приложение — во весь экран, с иконкой рядом с остальными.
      </p>

      <ol className="mt-3 space-y-2">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-medium text-white">
                {i + 1}
              </span>
              <span>
                {step.before} {Icon && <Icon className="inline h-4 w-4 align-text-bottom text-green-700" aria-hidden />}{" "}
                <b className="font-medium">{step.strong}</b>
                {step.after && ` ${step.after}`}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
