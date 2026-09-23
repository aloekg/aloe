"use client";

import { useFilterNav } from "@/hooks/useFilterNav";
import { hasPriceRange, type PriceRange, type SortValue } from "@/lib/page-params";
import Button from "./Button";
import PriceFilter from "./PriceFilter";
import SortSelect from "./SortSelect";

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
  onChange?: (next: { sort: SortValue; range: PriceRange }) => void;
  /** Qualifies what the sort applies to, e.g. "в каждом разделе" on the category page. */
  note?: string;
  className?: string;
};

/**
 * Sort order and price range, in one row. Nothing here renders a link: see SortSelect.
 *
 * Deliberately not a "Фильтры" button opening a sheet on a phone. The two controls occupy about the
 * height that button would, the price inputs apply on a pause rather than per keystroke, and a
 * staged sheet would mean a second copy of the filter state that has to be kept in step with this
 * one. If the bar grows a third and fourth control, that trade changes.
 */
export default function ProductFilterBar({ sort, range, bounds, onChange, note, className }: Props) {
  const navigate = useFilterNav();
  const active = hasPriceRange(range) || sort !== "name";

  const setSort = (next: SortValue) => {
    if (onChange) onChange({ sort: next, range });
    else navigate({ sort: next === "name" ? null : next });
  };

  const setRange = (next: PriceRange) => {
    if (onChange) onChange({ sort, range: next });
    else
      navigate({
        price_min: next.min == null ? null : String(next.min),
        price_max: next.max == null ? null : String(next.max),
      });
  };

  const reset = () => {
    if (onChange) onChange({ sort: "name", range: { min: null, max: null } });
    else navigate({ sort: null, price_min: null, price_max: null });
  };

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${className ?? ""}`}>
      <SortSelect current={sort} onChange={setSort} />
      <PriceFilter value={range} onChange={setRange} bounds={bounds} className="max-w-xs" />
      {note && <span className="text-xs text-gray-500 basis-full md:basis-auto">{note}</span>}
      {active && (
        <Button variant="ghost" onClick={reset} className="text-xs ml-auto">
          Сбросить фильтры
        </Button>
      )}
    </div>
  );
}
