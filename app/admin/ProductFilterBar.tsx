"use client";

import Button from "@/components/Button";
import type { SortBy } from "./AdminProducts";

const LABEL_FILTERS = [
  { value: "", label: "Все" },
  { value: "new", label: "Новинка" },
  { value: "sale", label: "Акция" },
  { value: "none", label: "Без метки" },
];

const PUBLISHED_FILTERS = [
  { value: "", label: "Все статусы" },
  { value: "yes", label: "Опубликованные" },
  { value: "no", label: "Скрытые" },
];

type Props = {
  label: string;
  published: string;
  category: string;
  categories: { id: number; name: string; depth: number }[];
  sort: SortBy;
  onLabelChange: (value: string) => void;
  onPublishedChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSortChange: (value: string) => void;
};

export default function ProductFilterBar({
  label,
  published,
  category,
  categories,
  sort,
  onLabelChange,
  onPublishedChange,
  onCategoryChange,
  onSortChange,
}: Props) {
  return (
    <div className="flex flex-wrap flex-col md:flex-row items-start md:items-center gap-2 mb-4">
      <div className="flex flex-wrap flex-col md:flex-row gap-2 flex-1">
        <div className="flex flex-wrap gap-1">
          {LABEL_FILTERS.map((l) => (
            <Button
              key={l.value}
              onClick={() => onLabelChange(l.value)}
              aria-pressed={label === l.value}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                label === l.value
                  ? "bg-green-700 text-white border-green-600"
                  : "border-gray-300 text-gray-600 hover:border-green-600 hover:text-green-700"
              }`}
            >
              {l.label}
            </Button>
          ))}
        </div>
        <div className="hidden md:block w-px h-4 bg-gray-300 self-center mx-1" />
        <div className="flex flex-wrap gap-1">
          {PUBLISHED_FILTERS.map((p) => (
            <Button
              key={p.value}
              onClick={() => onPublishedChange(p.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                published === p.value
                  ? "bg-gray-700 text-white border-gray-700"
                  : "border-gray-300 text-gray-600 hover:border-gray-500 hover:text-gray-700"
              }`}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>
      <select
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="border border-gray-500 rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-700 hover:cursor-pointer"
      >
        <option value="">Все категории</option>
        <option value="none">⚠ Без категории</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {"--".repeat(c.depth) + c.name}
          </option>
        ))}
      </select>
      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value)}
        className="border border-gray-500 rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-700 hover:cursor-pointer"
      >
        <option value="id-desc">Сначала новые</option>
        <option value="name-asc">По алфавиту</option>
        <option value="price-asc">Цена ↑</option>
        <option value="price-desc">Цена ↓</option>
        <option value="purchase-count-desc">Сначала продаваемые</option>
      </select>
    </div>
  );
}
