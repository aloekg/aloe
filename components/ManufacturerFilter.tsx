"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Button from "./Button";

type Brand = { id: number; name: string };

export default function ManufacturerFilter({
  manufacturers: brands,
  className,
}: {
  manufacturers: Brand[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // A fresh array each render would make the useCallback below pointless.
  const selected = useMemo(() => searchParams.getAll("brand").map(Number), [searchParams]);

  const toggle = useCallback(
    (id: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("brand");
      params.delete("page");

      const next = selected.includes(id) ? selected.filter((b) => b !== id) : [...selected, id];
      next.forEach((b) => params.append("brand", String(b)));
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, selected],
  );

  const reset = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("brand");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  if (brands.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-sm font-medium text-gray-700">Производитель</span>
        {selected.length > 0 && (
          <Button variant="ghost" onClick={reset} className="text-xs">
            Сбросить
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {brands.map((b) => {
          const active = selected.includes(b.id);
          return (
            <button
              key={b.id}
              onClick={() => toggle(b.id)}
              aria-pressed={active}
              className={`px-3 py-1 text-xs rounded-full border transition-colors hover:cursor-pointer ${
                active
                  ? "bg-green-700 border-green-600 text-white"
                  : "border-gray-300 text-gray-600 hover:border-green-600 hover:text-green-700"
              }`}
            >
              {b.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
