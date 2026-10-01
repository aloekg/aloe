"use client";

import { useEffect } from "react";
import Button from "@/components/Button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="border border-red-200 bg-red-50 rounded-lg p-6 text-center">
      <p className="font-medium mb-1">Не удалось загрузить раздел</p>
      <p className="text-sm text-gray-600 mb-4">
        Данные не изменены. Проверьте соединение и повторите — при повторяющейся ошибке смотрите логи Supabase.
      </p>
      <Button variant="primary" size="md" onClick={reset}>
        Повторить
      </Button>
      {error.digest && <p className="mt-4 text-xs text-gray-500 font-mono">Код ошибки: {error.digest}</p>}
    </div>
  );
}
