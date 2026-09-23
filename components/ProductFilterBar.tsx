"use client";

import { useCallback, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useFilterNav } from "@/hooks/useFilterNav";
import { hasPriceRange, type PriceRange, type SortValue } from "@/lib/page-params";
import Button from "./Button";
import PriceFilter from "./PriceFilter";
import Sheet from "./Sheet";
import SortSelect from "./SortSelect";

export type FilterState = { sort: SortValue; range: PriceRange };

const NO_FILTERS: FilterState = { sort: "name", range: { min: null, max: null } };

type Props = {
  sort: SortValue;
  range: PriceRange;
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
   * How many products a candidate filter would leave, for the sheet's apply button. Only pages that
   * hold the whole set can answer it; /search cannot, and there the button just says "Показать".
   */
  countFor?: (next: FilterState) => number;
  /**
   * Explains what sorting by price does here — "в каждом разделе" on the category page. Always
   * shown in the sheet, where the choice is about to be made; inline only once a price sort is on,
   * since the row is permanent there and an unconditional hint becomes furniture.
   */
  note?: string;
  className?: string;
};

function activeCount({ sort, range }: FilterState): number {
  return (sort === "name" ? 0 : 1) + (hasPriceRange(range) ? 1 : 0);
}

/**
 * Sort order and price range. **A sheet below `md`, an inline row from `md` up** — this is a mobile
 * first storefront, and a permanent two-control row above the sticky subcategory pills spends
 * vertical space on every visit to serve the few that filter. The button spends one line and says
 * how many filters are on.
 *
 * The sheet stages its state and commits on "Показать": on /search every change is a navigation, so
 * applying per keystroke would send three requests to set one range. That staged copy is the cost
 * of the sheet, and the reason the inline path deliberately has none.
 *
 * Nothing here renders a link — see SortSelect.
 */
export default function ProductFilterBar({ sort, range, bounds, onChange, countFor, note, className }: Props) {
  const navigate = useFilterNav();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [staged, setStaged] = useState<FilterState>({ sort, range });

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

  const active = activeCount({ sort, range });

  const openSheet = () => {
    setStaged({ sort, range });
    setClosing(false);
    setOpen(true);
  };

  const controls = (value: FilterState, onValue: (next: FilterState) => void, stacked: boolean) => (
    <>
      <SortSelect current={value.sort} onChange={(next) => onValue({ ...value, sort: next })} />
      <PriceFilter
        value={value.range}
        onChange={(next) => onValue({ ...value, range: next })}
        bounds={bounds}
        className={stacked ? "flex-wrap" : undefined}
      />
    </>
  );

  return (
    <>
      {/* Phone: one line, and it says how many filters are on. */}
      <div className={`md:hidden ${className ?? ""}`}>
        <Button variant="secondary" onClick={openSheet} className="flex items-center gap-2" aria-haspopup="dialog">
          <SlidersHorizontal className="size-4" aria-hidden />
          Фильтры
          {active > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-green-700 text-white text-xs">
              {active}
            </span>
          )}
        </Button>
      </div>

      {/* Tablet and up, where the row costs nothing: no staging, no sheet, applies as you go. */}
      <div className={`hidden md:flex flex-wrap items-center gap-x-4 gap-y-2 ${className ?? ""}`}>
        {controls({ sort, range }, commit, false)}
        {note && sort !== "name" && <span className="text-xs text-gray-500">{note}</span>}
        {active > 0 && (
          <Button variant="ghost" onClick={() => commit(NO_FILTERS)} className="text-xs ml-auto">
            Сбросить фильтры
          </Button>
        )}
      </div>

      {open && (
        <Sheet
          label="Фильтры"
          requestClose={closing}
          onClose={() => {
            setOpen(false);
            setClosing(false);
          }}
          width="max-w-md"
        >
          <div className="flex flex-col gap-5 px-4 pb-6">
            <h3 className="text-base font-semibold">Фильтры</h3>
            <div className="flex flex-col gap-4">{controls(staged, setStaged, true)}</div>
            {note && <p className="text-xs text-gray-500">{note}</p>}
            <div className="flex items-center gap-3 pt-1">
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                onClick={() => {
                  commit(staged);
                  setClosing(true);
                }}
              >
                {countFor ? `Показать ${countFor(staged)}` : "Показать"}
              </Button>
              {activeCount(staged) > 0 && (
                <Button variant="secondary" size="lg" onClick={() => setStaged(NO_FILTERS)}>
                  Сбросить
                </Button>
              )}
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
