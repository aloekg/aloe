"use client";

import Image from "next/image";
import Button from "../Button";
import Currency from "../Currency";

export type AutocompleteProduct = {
  id: number;
  name: string;
  price: number | null;
  image_url: string | null;
  thumbnail_url: string | null;
  category_id: number | null;
};

export default function AutocompleteDropdown({
  results,
  loading,
  activeIndex,
  listboxId,
  optionId,
  onSelect,
  onHover,
}: {
  results: AutocompleteProduct[];
  loading: boolean;
  activeIndex: number;
  listboxId: string;
  optionId: (index: number) => string;
  onSelect: (product: AutocompleteProduct) => void;
  onHover: (index: number) => void;
}) {
  if (loading) return null;

  const shell = "absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50";

  if (results.length === 0) {
    return <div className={`${shell} px-4 py-3 text-sm text-gray-500`}>Ничего не найдено</div>;
  }

  return (
    // Keeps focus in the input, so a blur cannot let the outside-click handler close the popup first.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={`${shell} overflow-hidden`} onMouseDown={(e) => e.preventDefault()}>
      <ul id={listboxId} role="listbox" aria-label="Предложения по запросу">
        {results.map((p, i) => (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <li
            key={p.id}
            id={optionId(i)}
            role="option"
            aria-selected={i === activeIndex}
            onClick={() => onSelect(p)}
            onMouseEnter={() => onHover(i)}
            className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-left ${
              i === activeIndex ? "bg-gray-100" : ""
            }`}
          >
            <div className="relative w-10 h-10 shrink-0 bg-gray-100 rounded">
              <Image
                src={p.thumbnail_url || p.image_url || ""}
                alt=""
                fill
                sizes="40px"
                className="object-contain p-1"
                unoptimized
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{p.name}</p>
              <p className="text-xs text-green-700 font-medium">
                {p.price} <Currency />
              </p>
            </div>
          </li>
        ))}
      </ul>
      <Button
        type="submit"
        variant="ghost"
        className="w-full px-4 py-2 text-sm font-medium hover:bg-gray-50 border-t border-gray-300 text-center"
      >
        Показать все результаты →
      </Button>
    </div>
  );
}
