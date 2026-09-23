"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

type Updates = Record<string, string | string[] | null | undefined>;

/**
 * How a storefront filter writes itself into the URL.
 *
 * `navigate` re-renders on the server, which is what /search needs: its result set, its COUNT and
 * therefore its page count all come from the database.
 *
 * `url-only` writes the address bar through the History API and nothing else — the category page
 * already holds every product of the category on the client, so a filter change there is a local
 * array operation and a server round trip would buy nothing but latency. This is the same reason
 * SubcategoryFilter writes `?sub=` this way.
 */
export type FilterNavMode = "navigate" | "url-only";

/**
 * Merges filter updates into the current query string. The storefront's counterpart to
 * `useAdminListNav`, and it exists for the same reason: **the `page` reset lives in one place**.
 * Narrowing a filter shrinks the result set, so the page you were on may no longer exist — and
 * /search and the label pages answer a page past the end with `notFound()`. Left to each control,
 * that rule holds only as long as nobody forgets it.
 *
 * Reads `window.location.search` at call time rather than closing over `useSearchParams()`. On the
 * category page two writers share the query string — this one and SubcategoryFilter's `?sub=` —
 * and a cached copy of the params would have each of them silently drop the other's key.
 */
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

      // Never conditional: every update here is a filter, and a filter always invalidates the page.
      params.delete("page");

      const qs = params.toString();
      const url = qs ? `?${qs}` : window.location.pathname;

      // `replace`, not `push`: a price input applies as you pause typing, and pushing would turn
      // the Back button into a tape of half-typed numbers.
      if (mode === "url-only") window.history.replaceState(window.history.state, "", url);
      else router.replace(url, { scroll: false });
    },
    [router, mode],
  );
}
