"use client";

import { useCallback, useState } from "react";
import { ArrowDownUp, Check, SlidersHorizontal } from "lucide-react";
import { useFilterNav } from "@/hooks/useFilterNav";
import { cn } from "@/lib/cn";
import { hasPriceRange, type PriceRange, type SortValue } from "@/lib/page-params";
import Button from "./Button";
import PriceFilter from "./PriceFilter";
import Sheet from "./Sheet";

// Buttons in a sheet, never links: a sort order must not mint a crawlable URL.
export const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "name", label: "По названию" },
  { value: "popular", label: "По популярности" },
  { value: "newest", label: "По новизне" },
  { value: "price_asc", label: "По возрастанию цены" },
  { value: "price_desc", label: "По убыванию цены" },
];

export type FilterState = { sort: SortValue; range: PriceRange; brands: number[] };

export type BrandOption = { id: number; name: string };

const NO_PRICE: PriceRange = { min: null, max: null };
const NO_BRANDS: number[] = [];

type SheetKind = "sort" | "filters";

type Props = {
  sort: SortValue;
  range: PriceRange;
  // Brand filtering is offered only where options are passed: the category page, which holds the whole set.
  brands?: number[];
  brandOptions?: BrandOption[];
  // `inline`: the md-and-up row of labelled triggers (/search); `icons`: two round ones, phone-only
  // unless `className` overrides `md:hidden` — the category page shows them at every width.
  variant: "inline" | "icons";
  bounds?: { min: number; max: number } | null;
  onChange?: (next: FilterState) => void;
  countFor?: (next: FilterState) => number;
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

function TextTrigger({
  icon: Icon,
  label,
  active,
  onClick,
  children,
}: {
  icon: typeof ArrowDownUp;
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-haspopup="dialog"
      className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer ${
        active ? "border-green-700 text-green-700 bg-green-50" : "border-gray-500 text-gray-700 hover:bg-gray-50"
      }`}
    >
      <Icon className="size-4" aria-hidden />
      {children}
    </button>
  );
}

function BrandPicker({
  options,
  selected,
  onChange,
}: {
  options: BrandOption[];
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm text-gray-500 mb-2">Бренд</legend>
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

  const stagedDirty = stagedBrands.length > 0 || hasPriceRange(staged);
  const activeFilters = (hasPriceRange(range) ? 1 : 0) + brands.length;
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? SORT_OPTIONS[0].label;

  // One sheet for both variants: a bottom sheet edge to edge on a phone, a drawer on the right from md.
  const sheetEl = sheet && (
    <Sheet
      heading={sheet === "sort" ? "Сортировка" : "Фильтры"}
      requestClose={closing}
      onClose={() => {
        setSheet(null);
        setClosing(false);
      }}
      drawer
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
        <div className="flex flex-col flex-1 gap-5 px-4">
          <PriceFilter value={staged} onChange={setStaged} bounds={bounds} stretch />
          {brandList && <BrandPicker options={brandList} selected={stagedBrands} onChange={setStagedBrands} />}
          {/* Sticky: a long brand list scrolls the panel; mt-auto: in the full-height drawer it sits at the foot. */}
          <div className="sticky bottom-0 mt-auto -mx-4 px-4 pt-3 pb-6 bg-white flex items-center gap-3">
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
                  setStaged(NO_PRICE);
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
    const active = sort !== "name" || activeFilters > 0;
    return (
      <div className={`hidden md:flex flex-wrap items-center gap-x-3 gap-y-2 ${className ?? ""}`}>
        <TextTrigger
          icon={ArrowDownUp}
          label={`Сортировка: ${sortLabel}`}
          active={sort !== "name"}
          onClick={() => open("sort")}
        >
          {sortLabel}
        </TextTrigger>
        <TextTrigger
          icon={SlidersHorizontal}
          label={activeFilters > 0 ? `Фильтры, применено: ${activeFilters}` : "Фильтры"}
          active={activeFilters > 0}
          onClick={() => open("filters")}
        >
          {activeFilters > 0 ? `Фильтры · ${activeFilters}` : "Фильтры"}
        </TextTrigger>
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
      <div className={cn("flex md:hidden shrink-0 items-center gap-2", className)}>
        <IconTrigger icon={ArrowDownUp} label="Сортировка" active={sort !== "name"} onClick={() => open("sort")} />
        <IconTrigger
          icon={SlidersHorizontal}
          label="Фильтры"
          active={activeFilters > 0}
          onClick={() => open("filters")}
        />
      </div>
      {sheetEl}
    </>
  );
}
