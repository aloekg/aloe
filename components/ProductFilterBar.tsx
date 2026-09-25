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
  variant: "inline" | "icons";
  bounds?: { min: number; max: number } | null;
  onChange?: (next: FilterState) => void;
  countFor?: (next: FilterState) => number;
  note?: string;
  className?: string;
};

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
      aria-label={active ? `${label} — применено` : label}
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

export default function ProductFilterBar({ sort, range, variant, bounds, onChange, countFor, note, className }: Props) {
  const navigate = useFilterNav();
  const [sheet, setSheet] = useState<"sort" | "price" | null>(null);
  const [closing, setClosing] = useState(false);
  // The price sheet stages and commits on "Показать": on /search every commit is a navigation.
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
          heading={sheet === "sort" ? "Сортировка" : "Фильтры"}
          requestClose={closing}
          onClose={() => {
            setSheet(null);
            setClosing(false);
          }}
          width="max-w-md"
        >
          {sheet === "sort" ? (
            <div role="radiogroup" aria-label="Порядок сортировки" className="flex flex-col gap-1 px-4 pb-6">
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  onClick={() => {
                    commit({ sort: o.value, range });
                    setClosing(true);
                  }}
                  aria-checked={o.value === sort}
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
