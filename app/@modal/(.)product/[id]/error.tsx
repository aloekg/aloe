"use client";

import { useEffect } from "react";
import Button from "@/components/Button";

/**
 * Without this, a failed quick-view fetch bubbles to the page-level boundary and replaces the
 * grid the user was browsing. Keeping the failure inside the modal preserves that context.
 */
export default function ProductModalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="m-auto p-8 text-center">
      <p className="font-medium mb-1">Не удалось загрузить товар</p>
      <p className="text-sm text-gray-500 mb-5">Закройте окно и попробуйте ещё раз.</p>
      <Button variant="primary" size="md" onClick={reset}>
        Повторить
      </Button>
    </div>
  );
}
