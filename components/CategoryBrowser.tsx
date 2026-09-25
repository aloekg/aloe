"use client";

import { useCallback, useMemo, useState } from "react";
import { useFilterNav } from "@/hooks/useFilterNav";
import type { PriceRange, SortValue } from "@/lib/page-params";
import { filterCategorySections, priceBounds } from "@/lib/price-filter";
import type { ProductListItem } from "@/types";
import Container from "./Container";
import MainContainer from "./MainContainer";
import ProductFilterBar, { type FilterState } from "./ProductFilterBar";
import SubcategoryFilter from "./SubcategoryFilter";
import VirtualCategoryContent from "./VirtualCategoryContent";

type Section = {
  id: number;
  name: string;
  products: ProductListItem[];
  groups: { id: number; name: string; products: ProductListItem[] }[];
};

type Props = {
  sections: Section[];
  subcategories: { id: number; name: string; slug: string }[];
  initialSort: SortValue;
  initialRange: PriceRange;
  initialSectionId?: number;
  children?: React.ReactNode;
};

export default function CategoryBrowser({
  sections,
  subcategories,
  initialSort,
  initialRange,
  initialSectionId,
  children,
}: Props) {
  const [sort, setSort] = useState<SortValue>(initialSort);
  const [range, setRange] = useState<PriceRange>(initialRange);
  const navigate = useFilterNav("url-only");

  // The ?sub= deep-link scroll applies only to the view the URL asked for.
  const isInitialView = sort === initialSort && range.min === initialRange.min && range.max === initialRange.max;

  // Same transform page.tsx applies server-side, so filterCategorySections must stay pure.
  const visible = useMemo(() => filterCategorySections(sections, range, sort), [sections, range, sort]);

  // Bounds from the whole category on purpose, not from the filtered set.
  const bounds = useMemo(
    () => priceBounds(sections.flatMap((s) => [...s.products, ...s.groups.flatMap((g) => g.products)])),
    [sections],
  );

  const visibleIds = useMemo(() => new Set(visible.map((s) => s.id)), [visible]);
  const visibleSubcategories = useMemo(
    () => subcategories.filter((s) => visibleIds.has(s.id)),
    [subcategories, visibleIds],
  );

  const countFor = useCallback(
    (next: FilterState) =>
      filterCategorySections(sections, next.range, next.sort).reduce(
        (n, s) => n + s.products.length + s.groups.reduce((m, g) => m + g.products.length, 0),
        0,
      ),
    [sections],
  );

  const apply = (next: FilterState) => {
    setSort(next.sort);
    setRange(next.range);
    navigate({
      sort: next.sort === "name" ? null : next.sort,
      price_min: next.range.min == null ? null : String(next.range.min),
      price_max: next.range.max == null ? null : String(next.range.max),
    });
  };

  return (
    <>
      <Container className="md:py-2">
        <ProductFilterBar
          variant="inline"
          sort={sort}
          range={range}
          bounds={bounds}
          onChange={apply}
          note="Сортировка по цене — в каждом разделе"
        />
      </Container>

      <SubcategoryFilter
        subcategories={visibleSubcategories}
        leading={
          <ProductFilterBar
            variant="icons"
            sort={sort}
            range={range}
            bounds={bounds}
            onChange={apply}
            countFor={countFor}
            note="Сортировка по цене — в каждом разделе"
          />
        }
      />

      <MainContainer>
        {visible.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">По выбранным фильтрам ничего не найдено</p>
            <button
              onClick={() => apply({ sort: "name", range: { min: null, max: null } })}
              className="text-green-700 text-sm mt-2 inline-block hover:underline cursor-pointer"
            >
              Сбросить фильтры
            </button>
          </div>
        ) : (
          <VirtualCategoryContent
            // Remounts the virtualizer: its measurements go stale when the sections change shape.
            key={`${sort}:${range.min ?? ""}:${range.max ?? ""}`}
            sections={visible}
            initialSectionId={isInitialView ? initialSectionId : undefined}
          />
        )}
        {children}
      </MainContainer>
    </>
  );
}
