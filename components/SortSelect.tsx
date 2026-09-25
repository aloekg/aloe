"use client";

import { useCallback } from "react";
import { useFilterNav } from "@/hooks/useFilterNav";
import type { SortValue } from "@/lib/page-params";

export const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "name", label: "По названию" },
  { value: "popular", label: "По популярности" },
  { value: "newest", label: "По новизне" },
  { value: "price_asc", label: "По возрастанию цены" },
  { value: "price_desc", label: "По убыванию цены" },
];

// A <select>, never links: a sort order must not mint a crawlable URL.
export default function SortSelect({
  current,
  onChange,
  label = "Сортировка:",
}: {
  current: SortValue;
  onChange?: (value: SortValue) => void;
  label?: string;
}) {
  const navigate = useFilterNav();

  const handle = useCallback(
    (value: SortValue) => {
      if (onChange) onChange(value);
      else navigate({ sort: value === "name" ? null : value });
    },
    [onChange, navigate],
  );

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort" className="text-sm text-gray-500 whitespace-nowrap">
        {label}
      </label>
      <select
        id="sort"
        value={current}
        onChange={(e) => handle(e.target.value as SortValue)}
        className="text-sm border border-gray-500 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-700 focus:border-green-700 hover:cursor-pointer"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
