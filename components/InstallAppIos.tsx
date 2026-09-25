"use client";

import { useState, useSyncExternalStore } from "react";
import { Ellipsis, Share, SquarePlus, X } from "lucide-react";
import Button from "@/components/Button";
import { cn } from "@/lib/cn";

const DISMISSED_KEY = "install-hint-dismissed";
const STANDALONE = "(display-mode: standalone)";

const NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line\//;

let iosSafari: boolean | null = null;

// iPadOS reports itself as Macintosh; maxTouchPoints tells an iPad from a Mac.
function isIosSafari(): boolean {
  if (iosSafari === null) {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPod/.test(ua) || (/iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    iosSafari = ios && !NOT_SAFARI.test(ua);
  }
  return iosSafari;
}

// `navigator.standalone` is what iOS actually sets.
function isInstalled(): boolean {
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia(STANDALONE).matches || legacy === true;
}

function applies(): boolean {
  return isIosSafari() && !isInstalled();
}

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

export default function InstallAppIos({ className }: { className?: string }) {
  const show = useSyncExternalStore(subscribeToDisplayMode, applies, () => false);
  const [dismissed, setDismissed] = useState(() => {
    // Runs during SSR too, and localStorage throws in a private window.
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
      // Private mode: localStorage throws.
    }
  }

  return (
    <div className={cn("relative rounded-xl border border-green-200 bg-green-50 p-4", className)}>
      <Button
        variant="icon"
        size="sm"
        onClick={dismiss}
        aria-label="Скрыть подсказку"
        className="absolute right-1 top-1 text-gray-500 hover:bg-green-100 hover:text-gray-600"
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
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-700 text-xs font-medium text-white">
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
