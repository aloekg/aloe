"use client";

import { useCallback, useState } from "react";
import { ArrowDownUp, Check, SlidersHorizontal } from "lucide-react";
import { useFilterNav } from "@/hooks/useFilterNav";
import { hasPriceRange, type PriceRange, type SortValue } from "@/lib/page-params";
import Button from "./Button";
import PriceFilter from "./PriceFilter";
import Sheet from "./Sheet";
import SortSelect, { SORT_OPTIONS } from "./SortSelect";

export type FilterState = { sort: SortValue; range: PriceRange };

const NO_PRICE: PriceRange = { min: null, max: null };

type Props = {
  sort: SortValue;
  range: PriceRange;
  /**
   * `inline` is the `md`-and-up row, `icons` the two phone triggers. Each carries its own
   * breakpoint visibility, so a caller can drop them in different places — the category page puts
   * the icons inside the sticky pill row and the row above it.
   */
  variant: "inline" | "icons";
  /** The cheapest and dearest of the set being filtered, for the inputs' placeholders. */
  bounds?: { min: number; max: number } | null;
  /**
   * Apply the change here instead of navigating. The category page passes this — it already holds
   * every product of the category, so it filters in place and only mirrors the result into the URL.
   * Without it the bar writes `?sort=`/`?price_min=`/`?price_max=` and the server re-renders, which
   * is what /search needs: its result set and its page count both come from the database.
   */
  onChange?: (next: FilterState) => void;
  /**
   * How many products a candidate price range would leave, for the sheet's apply button. Only pages
   * holding the whole set can answer it; /search cannot, and there the button just says "Показать".
   */
  countFor?: (next: FilterState) => number;
  /**
   * Explains what sorting by price does here — "в каждом разделе" on the category page. Always
   * shown in the sort sheet, where the choice is about to be made; inline only once a price sort is
   * on, since the row is permanent there and an unconditional hint becomes furniture.
   */
  note?: string;
  className?: string;
};

/** A pill-shaped icon trigger, sized and bordered to sit in the subcategory row without standing out. */
function IconTrigger({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof ArrowDownUp;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-haspopup="dialog"
      className={`relative shrink-0 flex items-center justify-center size-9 rounded-full border transition-colors cursor-pointer ${
        active ? "border-green-700 text-green-700 bg-green-50" : "border-gray-300 text-gray-600 hover:bg-gray-50"
      }`}
    >
      <Icon className="size-4.5" aria-hidden />
      {active && <span aria-hidden className="absolute top-0.5 right-0.5 size-2 rounded-full bg-green-700" />}
    </button>
  );
}

/**
 * Sort order and price range.
 *
 * On a phone these are **two icons, not one "Фильтры" button and not a permanent row**: they live
 * at the head of the sticky subcategory row, where they cost no vertical space of their own and
 * stay reachable at any scroll depth. Sort and price are split because they are different questions
 * — "in what order" is one tap, "between which prices" is typing — and folding them into one sheet
 * made the common case pay for the rare one.
 *
 * The price sheet stages its state and commits on "Показать": on /search every change is a
 * navigation, so applying per keystroke would send three requests to set one range. The sort sheet
 * does not stage — one tap is the whole interaction. That staged copy is the only cost of the
 * sheets, and the reason the inline variant deliberately has none.
 *
 * Nothing here renders a link — see SortSelect.
 */
export default function ProductFilterBar({ sort, range, variant, bounds, onChange, countFor, note, className }: Props) {
  const navigate = useFilterNav();
  const [sheet, setSheet] = useState<"sort" | "price" | null>(null);
  const [closing, setClosing] = useState(false);
  const [staged, setStaged] = useState<PriceRange>(range);

  const commit = useCallback(
    (next: FilterState) => {
      if (onChange) {
        onChange(next);
        return;
      }
      navigate({
        sort: next.sort === "name" ? null : next.sort,
        price_min: next.range.min == null ? null : String(next.range.min),
        price_max: next.range.max == null ? null : String(next.range.max),
      });
    },
    [onChange, navigate],
  );

  const open = (which: "sort" | "price") => {
    if (which === "price") setStaged(range);
    setClosing(false);
    setSheet(which);
  };

  if (variant === "inline") {
    const active = sort !== "name" || hasPriceRange(range);
    return (
      <div className={`hidden md:flex flex-wrap items-center gap-x-4 gap-y-2 ${className ?? ""}`}>
        <SortSelect current={sort} onChange={(next) => commit({ sort: next, range })} />
        <PriceFilter value={range} onChange={(next) => commit({ sort, range: next })} bounds={bounds} />
        {note && sort !== "name" && <span className="text-xs text-gray-500">{note}</span>}
        {active && (
          <Button variant="ghost" onClick={() => commit({ sort: "name", range: NO_PRICE })} className="text-xs ml-auto">
            Сбросить фильтры
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className={`flex md:hidden shrink-0 items-center gap-2 ${className ?? ""}`}>
        <IconTrigger icon={ArrowDownUp} label="Сортировка" active={sort !== "name"} onClick={() => open("sort")} />
        <IconTrigger
          icon={SlidersHorizontal}
          label="Фильтры"
          active={hasPriceRange(range)}
          onClick={() => open("price")}
        />
      </div>

      {sheet && (
        <Sheet
          label={sheet === "sort" ? "Сортировка" : "Фильтры"}
          requestClose={closing}
          onClose={() => {
            setSheet(null);
            setClosing(false);
          }}
          width="max-w-md"
        >
          {sheet === "sort" ? (
            <div className="flex flex-col gap-1 px-4 pb-6">
              <h3 className="text-base font-semibold mb-2">Сортировка</h3>
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    commit({ sort: o.value, range });
                    setClosing(true);
                  }}
                  aria-pressed={o.value === sort}
                  className={`flex items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-base transition-colors cursor-pointer ${
                    o.value === sort ? "bg-green-50 text-green-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {o.label}
                  {o.value === sort && <Check className="size-5 shrink-0" aria-hidden />}
                </button>
              ))}
              {note && <p className="text-xs text-gray-500 mt-2 px-3">{note}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-5 px-4 pb-6">
              <h3 className="text-base font-semibold">Фильтры</h3>
              <PriceFilter value={staged} onChange={setStaged} bounds={bounds} className="flex-wrap" />
              <div className="flex items-center gap-3 pt-1">
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  onClick={() => {
                    commit({ sort, range: staged });
                    setClosing(true);
                  }}
                >
                  {countFor ? `Показать ${countFor({ sort, range: staged })}` : "Показать"}
                </Button>
                {hasPriceRange(staged) && (
                  <Button variant="secondary" size="lg" onClick={() => setStaged(NO_PRICE)}>
                    Сбросить
                  </Button>
                )}
              </div>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
