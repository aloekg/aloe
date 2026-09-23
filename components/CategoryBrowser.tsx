"use client";

import { useMemo, useState } from "react";
import { useFilterNav } from "@/hooks/useFilterNav";
import type { PriceRange, SortValue } from "@/lib/page-params";
import { filterCategorySections, priceBounds } from "@/lib/price-filter";
import type { ProductListItem } from "@/types";
import Container from "./Container";
import MainContainer from "./MainContainer";
import ProductFilterBar from "./ProductFilterBar";
import SubcategoryFilter from "./SubcategoryFilter";
import VirtualCategoryContent from "./VirtualCategoryContent";

type Section = {
  id: number;
  name: string;
  products: ProductListItem[];
  groups: { id: number; name: string; products: ProductListItem[] }[];
};

type Props = {
  /** Every section of the category, unfiltered — see the note on filtering below. */
  sections: Section[];
  subcategories: { id: number; name: string; slug: string }[];
  initialSort: SortValue;
  initialRange: PriceRange;
  initialSectionId?: number;
  /** Rendered after the grid, inside the same container — the next-category link. */
  children?: React.ReactNode;
};

/**
 * The filterable part of /catalog/[slug]: the filter bar, the sticky subcategory pills and the
 * virtualized grid, which have to agree on one set of sections.
 *
 * **Filtering happens here, on the client, and costs nothing.** The server already sent every
 * product of the category — one cached query, ~90 KB for the largest — so narrowing it is an array
 * operation, and routing a filter change through the server would spend a render and a Data Cache
 * lookup to compute what this component can compute in a frame. The URL is kept in step through the
 * History API for the same reason SubcategoryFilter does it: the address bar stays shareable
 * without a server round trip per interaction.
 *
 * The server applies the same filter for the first render (page.tsx), so a shared link, a reload or
 * a crawler sees the filtered page rather than a flash of the unfiltered one. Both sides call
 * `filterCategorySections`, which is why it must stay pure.
 */
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

  // Whether the view still shows what the URL asked for. The `?sub=` deep-link scroll belongs to
  // that view only: once the customer narrows or reorders the page, jumping them back to the
  // section the link named would fight the interaction they just made.
  const isInitialView = sort === initialSort && range.min === initialRange.min && range.max === initialRange.max;

  const visible = useMemo(() => filterCategorySections(sections, range, sort), [sections, range, sort]);

  // Placeholders come from the whole category, not from what the filter left — a box that renumbers
  // itself as you type is worse than no hint at all.
  const bounds = useMemo(
    () => priceBounds(sections.flatMap((s) => [...s.products, ...s.groups.flatMap((g) => g.products)])),
    [sections],
  );

  const visibleIds = useMemo(() => new Set(visible.map((s) => s.id)), [visible]);
  const visibleSubcategories = useMemo(
    () => subcategories.filter((s) => visibleIds.has(s.id)),
    [subcategories, visibleIds],
  );

  const apply = (next: { sort: SortValue; range: PriceRange }) => {
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
      <Container className="py-2">
        <ProductFilterBar
          sort={sort}
          range={range}
          bounds={bounds}
          onChange={apply}
          note={sort === "name" ? undefined : "в каждом разделе"}
        />
      </Container>

      <SubcategoryFilter subcategories={visibleSubcategories} />

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
            // Remounts the virtualizer when the set changes shape. Its row model, its measurement
            // cache and the section offsets are all derived from `sections`; reusing the instance
            // across a filter change left it scrolled to an offset that no longer existed.
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
