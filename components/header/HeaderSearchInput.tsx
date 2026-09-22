"use client";

import { SubmitEventHandler, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { MIN_QUERY, useProductAutocomplete } from "@/hooks/useProductAutocomplete";
import { cn } from "@/lib/cn";
import SearchInput from "../SearchInput";
import AutocompleteDropdown from "./AutocompleteDropdown";

export default function HeaderSearchInput({ className }: { className?: string }) {
  const [query, setQuery] = useState("");
  // Remembering *which* query was dismissed keeps this derived: no effect syncing a boolean,
  // and typing further re-opens the dropdown on its own.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const searchRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const { results, loading, isCurrent } = useProductAutocomplete(query);

  const close = useCallback(() => setDismissedFor(query), [query]);
  useOutsideClick(searchRef, close);

  const open = query.length >= MIN_QUERY && dismissedFor !== query;
  // During the debounce window nothing is in flight yet, so `loading` is false while `results` is
  // still empty (or left over from the previous keystroke) — reporting either as the answer for
  // what was just typed is wrong. `isCurrent` covers that gap; the input's own spinner keeps using
  // `loading`, so it only spins on a real request.
  const pending = loading || !isCurrent;

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setQuery("");
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <form
      ref={searchRef}
      onSubmit={handleSubmit}
      role="search"
      className={cn("relative flex flex-1", className)}
    >
      <SearchInput searchPath="/search" value={query} onChange={setQuery} loading={loading} />

      {open && <AutocompleteDropdown results={results} loading={pending} onSelect={() => setQuery("")} />}
    </form>
  );
}
