"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Sheet from "./Sheet";

/**
 * The quick view is a route, not a piece of local state: closing it means going back, which is what
 * unmounts this shell. Everything else about the sheet lives in `Sheet`.
 */
export default function ProductModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const close = useCallback(() => router.back(), [router]);

  return (
    <Sheet onClose={close} label="Быстрый просмотр товара" fullHeight>
      {children}
    </Sheet>
  );
}
