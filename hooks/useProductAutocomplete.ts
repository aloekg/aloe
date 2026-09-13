"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { searchProductsAutocomplete } from "@/services/product.service";

type Suggestion = Awaited<ReturnType<typeof searchProductsAutocomplete>>[number];

// pg_trgm needs three characters to extract a trigram, so a two-character ILIKE cannot use
// products_name_trgm_idx and degrades to a sequential scan over the whole catalogue — issued from
// the browser, unauthenticated, once per debounce window. Exported so callers open their dropdown
// on exactly the queries this hook will actually search for — a shorter threshold on their side
// renders an empty, never-fetched result list as "nothing found".
export const MIN_QUERY = 3;
const DEBOUNCE_MS = 300;

/**
 * Debounced product suggestions, previously implemented twice with the same race in both copies:
 * `clearTimeout` only cancels a timer that has not fired, so a slow reply for "шам" could
 * overwrite a fast one for "шампунь". The `cancelled` flag closes that.
 *
 * Results are stored alongside the query they belong to, so a caller can tell suggestions for the
 * current input from ones left over from a previous keystroke.
 */
export function useProductAutocomplete(query: string, limit?: number) {
  const [state, setState] = useState<{ query: string; items: Suggestion[] }>({ query: "", items: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < MIN_QUERY) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      // Inside the timeout rather than the effect body: `loading` then reflects a request that is
      // actually in flight, not the debounce wait.
      setLoading(true);
      try {
        const items = await searchProductsAutocomplete(createClient(), query, limit);
        if (!cancelled) setState({ query, items });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, limit]);

  const active = query.length >= MIN_QUERY;

  return {
    results: active ? state.items : [],
    /**
     * Derived rather than reset in the effect. The in-flight request's `finally` is skipped once
     * cancelled, so after clearing the input `loading` stayed true for the rest of the session —
     * spinner spinning and the clear button hidden, since it renders on `value && !loading`.
     * Deriving also keeps this out of an effect, which react-hooks/purity rightly objects to.
     */
    loading: active && loading,
    /** Whether `results` were fetched for exactly the query passed in. */
    isCurrent: state.query === query,
  };
}
