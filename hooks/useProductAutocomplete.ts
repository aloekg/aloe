"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { searchProductsAutocomplete } from "@/services/product.service";

type Suggestion = Awaited<ReturnType<typeof searchProductsAutocomplete>>[number];

// pg_trgm needs 3 characters, or the ILIKE is a full scan; callers must gate their dropdown on this too.
export const MIN_QUERY = 3;
const DEBOUNCE_MS = 300;

export function useProductAutocomplete(query: string, limit?: number) {
  const [state, setState] = useState<{ query: string; items: Suggestion[] }>({ query: "", items: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < MIN_QUERY) return;

    // `cancelled` guards against a slow earlier reply overwriting a newer one.
    let cancelled = false;
    const timer = setTimeout(async () => {
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
    // Derived, not reset: a cancelled request skips its `finally`, so a stored flag would stick.
    loading: active && loading,
    isCurrent: state.query === query,
  };
}
