"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import Button from "./Button";

type Props = {
  page: number;
  totalPages: number;
} & (
  | { onPageChange: (page: number) => void; basePath?: never; query?: never }
  | { basePath: string; query?: Record<string, string | string[]>; onPageChange?: never }
);

function getWindows(current: number, total: number): (number | null)[] {
  if (total <= 1) return [];
  const delta = 3;
  const lo = Math.max(2, current - delta);
  const hi = Math.min(total - 1, current + delta);
  const items: (number | null)[] = [1];
  if (lo > 3) items.push(null);
  else if (lo === 3) items.push(2);
  for (let p = lo; p <= hi; p++) items.push(p);
  if (hi < total - 2) items.push(null);
  else if (hi === total - 2) items.push(total - 1);
  items.push(total);
  return items;
}

const btnCls = (active: boolean, disabled = false) =>
  `px-2.5 py-1.5 text-sm border rounded-lg transition-colors hover:cursor-pointer flex items-center justify-center ${
    active
      ? "bg-green-700 text-white border-green-600"
      : disabled
        ? "border-gray-300 text-gray-300 cursor-not-allowed"
        : "border-gray-300 hover:bg-gray-50 text-gray-700"
  }`;

export default function Pagination({ page, totalPages, ...rest }: Props) {
  if (totalPages <= 1) return null;

  const onPageChange = "onPageChange" in rest ? rest.onPageChange : undefined;
  const toHref =
    "basePath" in rest
      ? (p: number) => {
          const params = new URLSearchParams();
          Object.entries(rest.query ?? {}).forEach(([k, v]) => {
            if (Array.isArray(v)) v.forEach((val) => params.append(k, val));
            else params.set(k, v);
          });
          params.set("page", String(p));
          return `${rest.basePath}?${params}`;
        }
      : undefined;

  const windows = getWindows(page, totalPages);

  const prevDisabled = page === 1;
  const nextDisabled = page === totalPages;

  return (
    <nav aria-label="Пагинация" className="flex items-center gap-1 flex-wrap justify-center mt-6">
      {toHref ? (
        prevDisabled ? (
          <span aria-disabled="true" className={btnCls(false, true)}>
            <ChevronLeft />
          </span>
        ) : (
          <Link href={toHref(page - 1)} aria-label="Предыдущая страница" className={btnCls(false)}>
            <ChevronLeft />
          </Link>
        )
      ) : (
        <Button
          onClick={() => onPageChange!(page - 1)}
          disabled={prevDisabled}
          aria-label="Предыдущая страница"
          className={btnCls(false, prevDisabled)}
        >
          <ChevronLeft />
        </Button>
      )}

      {windows.map((p, i) =>
        p === null ? (
          <span key={`e-${i}`} className="px-2 py-1.5 text-sm text-gray-500 select-none">
            …
          </span>
        ) : toHref ? (
          <Link key={p} href={toHref(p)} aria-current={p === page ? "page" : undefined} className={btnCls(p === page)}>
            {p}
          </Link>
        ) : (
          <Button
            key={p}
            onClick={() => onPageChange!(p)}
            aria-current={p === page ? "page" : undefined}
            className={btnCls(p === page)}
          >
            {p}
          </Button>
        ),
      )}

      {toHref ? (
        nextDisabled ? (
          <span aria-disabled="true" className={btnCls(false, true)}>
            <ChevronRight />
          </span>
        ) : (
          <Link href={toHref(page + 1)} aria-label="Следующая страница" className={btnCls(false)}>
            <ChevronRight />
          </Link>
        )
      ) : (
        <Button
          onClick={() => onPageChange!(page + 1)}
          disabled={nextDisabled}
          aria-label="Следующая страница"
          className={btnCls(false, nextDisabled)}
        >
          <ChevronRight />
        </Button>
      )}
    </nav>
  );
}
