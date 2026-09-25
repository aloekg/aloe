"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

type Updates = Record<string, string | string[] | null | undefined>;

export type FilterNavMode = "navigate" | "url-only";

// Read window.location.search at call time, not useSearchParams(): SubcategoryFilter also writes ?sub=.
export function useFilterNav(mode: FilterNavMode = "navigate") {
  const router = useRouter();

  return useCallback(
    (updates: Updates) => {
      const params = new URLSearchParams(window.location.search);

      for (const [key, value] of Object.entries(updates)) {
        params.delete(key);
        const values = value == null ? [] : Array.isArray(value) ? value : [value];
        for (const v of values) if (v !== "") params.append(key, v);
      }

      params.delete("page");

      const qs = params.toString();
      const url = qs ? `?${qs}` : window.location.pathname;

      // `replace`, not `push`: price inputs apply while typing and would flood the history.
      if (mode === "url-only") window.history.replaceState(window.history.state, "", url);
      else router.replace(url, { scroll: false });
    },
    [router, mode],
  );
}
