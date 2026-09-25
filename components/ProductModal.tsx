"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Sheet from "./Sheet";

export default function ProductModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const close = useCallback(() => router.back(), [router]);

  return (
    <Sheet onClose={close} label="Быстрый просмотр товара" fullHeight>
      {children}
    </Sheet>
  );
}
