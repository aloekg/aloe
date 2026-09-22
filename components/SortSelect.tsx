"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type SortValue = "name" | "price_asc" | "price_desc";

const OPTIONS: { value: SortValue; label: string }[] = [
  { value: "name", label: "По названию" },
  { value: "price_asc", label: "Сначала дешевле" },
  { value: "price_desc", label: "Сначала дороже" },
];

export default function SortSelect({ current }: { current: SortValue }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onChange = useCallback(
    (value: SortValue) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      if (value === "name") {
        params.delete("sort");
      } else {
        params.set("sort", value);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort" className="text-sm text-gray-500">
        Сортировка:
      </label>
      <select
        id="sort"
        value={current}
        onChange={(e) => onChange(e.target.value as SortValue)}
        className="text-sm border border-gray-500 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-700 focus:border-green-700 hover:cursor-pointer"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
