"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useIsClient } from "@/hooks/useIsClient";
import { setActiveSection } from "@/lib/active-section";
import { registerSectionScroller } from "@/lib/section-scroll";
import type { ProductListItem } from "@/types";
import ProductCard from "./ProductCard";
import ProductGrid from "./ProductGrid";

type Group = { id: number; name: string; products: ProductListItem[] };

type Section = {
  id: number;
  name: string;
  products: ProductListItem[];
  groups?: Group[];
};

type VirtualRow =
  | { type: "header"; name: string; first: boolean }
  | { type: "subheader"; name: string; first: boolean }
  | { type: "products"; items: ProductListItem[]; first: boolean };

// 160px min item + 16px gap
const ITEM_WIDTH = 176;
const PRODUCT_ROW_HEIGHT = 300;
const HEADER_HEIGHT = 52;
const SECTION_GAP = 40;
const SUBHEADER_HEIGHT = 36;
const GROUP_GAP = 24;

/**
 * How many products of each section the non-virtualized fallback renders. That fallback is what
 * the server sends and what the first client render hydrates, and it used to be the whole
 * category — up to ~470 cards, each with its own store subscriptions, all hydrated and then thrown
 * away the moment `useIsClient` flipped and the virtualizer took over with three rows. Twelve is
 * two desktop rows or six phone rows: more than the first screen shows, so nothing visible is
 * missing before hydration, and a fraction of the hydration work. The crawler sees the same twelve;
 * every product also has its own page, and the sitemap lists them all.
 */
const SSR_PRODUCTS_PER_SECTION = 12;

function sectionRowCount(section: Section, cols: number): number {
  if (!section.groups?.length) return 1 + Math.ceil(section.products.length / cols);
  const restRows = section.products.length > 0 ? Math.ceil(section.products.length / cols) : 0;
  const groupRows = section.groups.reduce((sum, g) => sum + 1 + Math.ceil(g.products.length / cols), 0);
  return 1 + restRows + groupRows;
}

function buildRows(sections: Section[], cols: number): VirtualRow[] {
  const rows: VirtualRow[] = [];
  let sawFirstProductsRow = false;
  const pushProductsRows = (products: ProductListItem[]) => {
    for (let i = 0; i < products.length; i += cols) {
      rows.push({ type: "products", items: products.slice(i, i + cols), first: !sawFirstProductsRow });
      sawFirstProductsRow = true;
    }
  };
  sections.forEach(({ name, products, groups }, si) => {
    rows.push({ type: "header", name, first: si === 0 });
    pushProductsRows(products);
    groups?.forEach((g, gi) => {
      rows.push({ type: "subheader", name: g.name, first: gi === 0 && products.length === 0 });
      pushProductsRows(g.products);
    });
  });
  return rows;
}

function VirtualizedProducts({ sections, initialSectionId }: { sections: Section[]; initialSectionId?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(3);
  const didInitialScroll = useRef(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Every setCols invalidates the row model, the section offsets and all virtualizer
    // estimates, so dragging a window edge used to trigger dozens of full rebuilds. Coalesce
    // into a frame and bail when the column count has not actually changed.
    let frame: number | null = null;
    const measure = () => {
      frame = null;
      const next = Math.max(2, Math.floor((el.offsetWidth + 16) / ITEM_WIDTH));
      setCols((prev) => (prev === next ? prev : next));
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(measure);
    };

    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  const rows = useMemo(() => buildRows(sections, cols), [sections, cols]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (i) => {
      const row = rows[i];
      if (row.type === "header") return (row.first ? 0 : SECTION_GAP) + HEADER_HEIGHT;
      if (row.type === "subheader") return (row.first ? 0 : GROUP_GAP) + SUBHEADER_HEIGHT;
      return PRODUCT_ROW_HEIGHT;
    },
    overscan: 3,
  });

  const sectionHeaderRows = useMemo(() => {
    const result: number[] = [];
    let rowIdx = 0;
    sections.forEach((s) => {
      result.push(rowIdx);
      rowIdx += sectionRowCount(s, cols);
    });
    return result;
  }, [sections, cols]);

  useEffect(() => {
    // getBoundingClientRect() forces a synchronous layout, and getMeasurements() walks every
    // row — doing both on each scroll event was the main jank source on the busiest page of
    // the site. Cache the container offset and coalesce work into one frame.
    let containerDocTop = 0;
    let frame: number | null = null;

    const measureTop = () => {
      if (containerRef.current) {
        containerDocTop = containerRef.current.getBoundingClientRect().top + window.scrollY;
      }
    };

    const update = () => {
      frame = null;
      // Re-measured here, not just on resize: the sticky subcategory bar switches between
      // flex-wrap and flex-nowrap as a *result* of scrolling, which changes the height above the
      // container and desynced a cached offset. The read is once per frame either way.
      measureTop();
      const relPos = window.scrollY + 220 - containerDocTop;
      const measurements = (
        virtualizer as unknown as { getMeasurements: () => Array<{ start: number }> }
      ).getMeasurements();
      let activeIdx = 0;
      // No early exit: a not-yet-measured row reads as Infinity, and bailing there would pick
      // the wrong section. The loop is over sections (a dozen), not rows.
      for (let si = 0; si < sectionHeaderRows.length; si++) {
        const start = measurements[sectionHeaderRows[si]]?.start ?? Infinity;
        if (start <= relPos) activeIdx = si;
      }
      setActiveSection(sections[activeIdx]?.id ?? null);
    };

    const onScroll = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };

    const onResize = () => {
      measureTop();
      onScroll();
    };

    measureTop();
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (frame !== null) cancelAnimationFrame(frame);
      setActiveSection(null);
    };
    // virtualizer is a stable class instance — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, sectionHeaderRows, cols]);

  useEffect(() => {
    const getScrollTarget = (sectionId: number): number | null => {
      if (!containerRef.current) return null;
      const sectionIndex = sections.findIndex((s) => s.id === sectionId);
      if (sectionIndex < 0) return null;

      let rowIdx = 0;
      for (let i = 0; i < sectionIndex; i++) {
        rowIdx += sectionRowCount(sections[i], cols);
      }

      // Use actual measured positions from the virtualizer cache (falls back to
      // estimateSize for items not yet rendered). Add containerDocTop so the
      // calculation works regardless of how much header space the page has.
      const measurements = (
        virtualizer as unknown as { getMeasurements: () => Array<{ start: number }> }
      ).getMeasurements();
      const itemStart = measurements[rowIdx]?.start;
      if (itemStart == null) return null;

      const containerDocTop = containerRef.current.getBoundingClientRect().top + window.scrollY;
      // 214px = desired viewport position of the section header (below the sticky bar)
      return Math.max(0, containerDocTop + itemStart - 214);
    };

    let rafId: number | null = null;

    const unregister = registerSectionScroller((sectionId) => {
      const target = getScrollTarget(sectionId);
      if (target != null) window.scrollTo({ top: target, behavior: "auto" });
    });

    // `cols` starts at a default guess and only reflects the real container width once the
    // layout effect above has measured it — skip locking in the initial scroll until then,
    // otherwise it computes a target using the wrong row layout and lands on the wrong section.
    const measuredCols = containerRef.current
      ? Math.max(2, Math.floor((containerRef.current.offsetWidth + 16) / ITEM_WIDTH))
      : null;
    if (initialSectionId != null && !didInitialScroll.current && measuredCols === cols) {
      didInitialScroll.current = true;
      const target = getScrollTarget(initialSectionId);
      if (target != null) {
        // The App Router's own post-navigation scroll handling briefly fights our scroll
        // during the first few frames after mount, so keep reasserting the target position
        // until it settles (bailing out once the user scrolls on their own).
        let frame = 0;
        const holdPosition = () => {
          if (Math.abs(window.scrollY - target) > 2 && Math.abs(window.scrollY) < 2) {
            window.scrollTo({ top: target, behavior: "auto" });
          }
          frame++;
          rafId = frame < 20 ? requestAnimationFrame(holdPosition) : null;
        };
        window.scrollTo({ top: target, behavior: "auto" });
        rafId = requestAnimationFrame(holdPosition);
      }
    }

    return () => {
      unregister();
      // Without this the loop keeps calling window.scrollTo after a navigation away,
      // yanking the next page to an unrelated offset.
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
    // virtualizer is a stable class instance — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, cols, initialSectionId]);

  return (
    <div ref={containerRef} style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const row = rows[virtualItem.index];
        return (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {row.type === "header" ? (
              <h2
                className="text-lg font-semibold mb-4 text-center md:text-left"
                style={{ paddingTop: row.first ? 0 : SECTION_GAP }}
              >
                {row.name}
              </h2>
            ) : row.type === "subheader" ? (
              <h3
                className="text-sm font-medium text-gray-500 mb-3 text-center md:text-left"
                style={{ paddingTop: row.first ? 0 : GROUP_GAP }}
              >
                {row.name}
              </h3>
            ) : (
              <div className="grid gap-4 pb-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                {row.items.map((product) => (
                  <ProductCard key={product.id} product={product} preload={row.first} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function VirtualCategoryContent({
  sections,
  initialSectionId,
}: {
  sections: Section[];
  initialSectionId?: number;
}) {
  const isClient = useIsClient();

  if (!isClient) {
    const firstProductId = sections
      .flatMap((s) => [...s.products, ...(s.groups?.flatMap((g) => g.products) ?? [])])
      .at(0)?.id;
    const renderGrid = (products: ProductListItem[]) => (
      <ProductGrid>
        {products.slice(0, SSR_PRODUCTS_PER_SECTION).map((product) => (
          <ProductCard key={product.id} product={product} preload={product.id === firstProductId} />
        ))}
      </ProductGrid>
    );
    return sections.map(({ id, name, products, groups }) => (
      <React.Fragment key={id}>
        <h2 className="text-lg font-semibold mb-4 text-center md:text-left">{name}</h2>
        {products.length > 0 && renderGrid(products)}
        {groups?.map((g) => (
          <React.Fragment key={g.id}>
            <h3 className="text-sm font-medium text-gray-500 mb-3 text-center md:text-left">{g.name}</h3>
            {renderGrid(g.products)}
          </React.Fragment>
        ))}
      </React.Fragment>
    ));
  }

  return <VirtualizedProducts sections={sections} initialSectionId={initialSectionId} />;
}
