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

/**
 * The suggestion popup of the ARIA combobox that HeaderSearchInput owns. The input keeps focus and
 * the state lives up there, so this renders a listbox and reports presses rather than acting on
 * them — which also puts the click path and the Enter path through one function instead of two.
 *
 * The suggestions used to be `<button>`s. That put every one of them in the tab order, so reaching
 * "показать все результаты" meant tabbing past ten products, and nothing announced that a list had
 * appeared under the field at all. As options they are not focusable: the parent moves
 * `aria-activedescendant` with the arrow keys while focus stays in the input, which is what makes
 * the arrow keys work for everyone and not only for whoever can see the highlight.
 */
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
  /** Index of the option `aria-activedescendant` points at, or -1 for none. */
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
    // Pressing an option must not blur the input first: focus belongs to the combobox, and a blur
    // would also let the outside-click handler close the popup before the click landed.
    <div className={`${shell} overflow-hidden`} onMouseDown={(e) => e.preventDefault()}>
      <ul id={listboxId} role="listbox" aria-label="Предложения по запросу">
        {results.map((p, i) => (
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
              {/* Empty alt: the name is right beside it, and repeating it would have the option
                  announced twice. */}
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
