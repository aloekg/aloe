"use client";

import { useCallback, useState } from "react";
import { ArrowDownUp, Check, SlidersHorizontal } from "lucide-react";
import { useFilterNav } from "@/hooks/useFilterNav";
import { hasPriceRange, type PriceRange, type SortValue } from "@/lib/page-params";
import Button from "./Button";
import PriceFilter from "./PriceFilter";
import Sheet from "./Sheet";
import SortSelect, { SORT_OPTIONS } from "./SortSelect";

export type FilterState = { sort: SortValue; range: PriceRange; brands: number[] };

export type BrandOption = { id: number; name: string };

const NO_PRICE: PriceRange = { min: null, max: null };
const NO_BRANDS: number[] = [];

type SheetKind = "sort" | "filters" | "brands";

type Props = {
  sort: SortValue;
  range: PriceRange;
  // Brand filtering is offered only where options are passed: the category page, which holds the whole set.
  brands?: number[];
  brandOptions?: BrandOption[];
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

function BrandPicker({
  options,
  selected,
  onChange,
  hideLegend = false,
}: {
  options: BrandOption[];
  selected: number[];
  onChange: (next: number[]) => void;
  // The brands-only dialog's heading already says it.
  hideLegend?: boolean;
}) {
  return (
    <fieldset>
      <legend className={hideLegend ? "sr-only" : "text-sm text-gray-500 mb-2"}>Бренд</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((b) => {
          const active = selected.includes(b.id);
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? selected.filter((id) => id !== b.id) : [...selected, b.id])}
              className={`px-3 py-1.5 text-sm rounded-full border transition-colors cursor-pointer ${
                active
                  ? "bg-green-700 border-green-700 text-white"
                  : "border-gray-300 text-gray-700 hover:border-green-600 hover:text-green-700"
              }`}
            >
              {b.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function ProductFilterBar({
  sort,
  range,
  brands = NO_BRANDS,
  brandOptions,
  variant,
  bounds,
  onChange,
  countFor,
  note,
  className,
}: Props) {
  const navigate = useFilterNav();
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [closing, setClosing] = useState(false);
  // The filter sheet stages and commits on "Показать": on /search every commit is a navigation.
  const [staged, setStaged] = useState<PriceRange>(range);
  const [stagedBrands, setStagedBrands] = useState<number[]>(brands);
  const brandList = brandOptions?.length ? brandOptions : null;

  const commit = useCallback(
    (next: FilterState) => {
      if (onChange) {
        onChange(next);
        return;
      }
      // ?brand= is ManufacturerFilter's on /search, so it is left alone here.
      navigate({
        sort: next.sort === "name" ? null : next.sort,
        price_min: next.range.min == null ? null : String(next.range.min),
        price_max: next.range.max == null ? null : String(next.range.max),
      });
    },
    [onChange, navigate],
  );

  const open = (which: SheetKind) => {
    setStaged(range);
    setStagedBrands(brands);
    setClosing(false);
    setSheet(which);
  };

  const stagedDirty = stagedBrands.length > 0 || (sheet === "filters" && hasPriceRange(staged));

  const sheetEl = sheet && (
    <Sheet
      heading={sheet === "sort" ? "Сортировка" : sheet === "brands" ? "Бренды" : "Фильтры"}
      requestClose={closing}
      onClose={() => {
        setSheet(null);
        setClosing(false);
      }}
      // Edge to edge on a phone, as a bottom sheet should be; a narrow dialog from md.
      width="md:max-w-md"
    >
      {sheet === "sort" ? (
        <div role="radiogroup" aria-label="Порядок сортировки" className="flex flex-col gap-1 px-4 pb-6">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              onClick={() => {
                commit({ sort: o.value, range, brands });
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
        </div>
      ) : (
        <div className="flex flex-col gap-5 px-4">
          {sheet === "filters" && <PriceFilter value={staged} onChange={setStaged} bounds={bounds} stretch />}
          {brandList && (
            <BrandPicker
              options={brandList}
              selected={stagedBrands}
              onChange={setStagedBrands}
              hideLegend={sheet === "brands"}
            />
          )}
          {/* Sticky: a long brand list scrolls the panel, and the button must stay in reach. */}
          <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-6 bg-white flex items-center gap-3">
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={() => {
                commit({ sort, range: staged, brands: stagedBrands });
                setClosing(true);
              }}
            >
              {countFor ? `Показать ${countFor({ sort, range: staged, brands: stagedBrands })}` : "Показать"}
            </Button>
            {stagedDirty && (
              <Button
                variant="secondary"
                size="lg"
                onClick={() => {
                  // The brands-only dialog leaves the inline price range alone.
                  if (sheet === "filters") setStaged(NO_PRICE);
                  setStagedBrands(NO_BRANDS);
                }}
              >
                Сбросить
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );

  if (variant === "inline") {
    const active = sort !== "name" || hasPriceRange(range) || brands.length > 0;
    return (
      <div className={`hidden md:flex flex-wrap items-center gap-x-4 gap-y-2 ${className ?? ""}`}>
        <SortSelect current={sort} onChange={(next) => commit({ sort: next, range, brands })} />
        <PriceFilter value={range} onChange={(next) => commit({ sort, range: next, brands })} bounds={bounds} />
        {brandList && (
          <button
            type="button"
            onClick={() => open("brands")}
            aria-haspopup="dialog"
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer ${
              brands.length > 0
                ? "border-green-700 text-green-700 bg-green-50"
                : "border-gray-500 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {brands.length > 0 ? `Бренды · ${brands.length}` : "Бренды"}
          </button>
        )}
        {note && sort !== "name" && <span className="text-xs text-gray-500">{note}</span>}
        {active && (
          <Button
            variant="ghost"
            onClick={() => commit({ sort: "name", range: NO_PRICE, brands: NO_BRANDS })}
            className="text-xs ml-auto"
          >
            Сбросить фильтры
          </Button>
        )}
        {sheetEl}
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
          active={hasPriceRange(range) || brands.length > 0}
          onClick={() => open("filters")}
        />
      </div>
      {sheetEl}
    </>
  );
}
