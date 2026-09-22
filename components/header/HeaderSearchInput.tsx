"use client";

import { SubmitEventHandler, useCallback, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { MIN_QUERY, useProductAutocomplete } from "@/hooks/useProductAutocomplete";
import { cn } from "@/lib/cn";
import SearchInput from "../SearchInput";
import AutocompleteDropdown, { type AutocompleteProduct } from "./AutocompleteDropdown";

export default function HeaderSearchInput({ className }: { className?: string }) {
  const [query, setQuery] = useState("");
  // Remembering *which* query was dismissed keeps this derived: no effect syncing a boolean,
  // and typing further re-opens the dropdown on its own.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  /** Option the arrow keys are on, or -1 when the field's own text is what Enter would submit. */
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const listboxId = useId();
  const optionIdPrefix = useId();
  const optionId = (index: number) => `${optionIdPrefix}-${index}`;

  const { results, loading, isCurrent } = useProductAutocomplete(query);

  const close = useCallback(() => setDismissedFor(query), [query]);
  useOutsideClick(searchRef, close);

  const open = query.length >= MIN_QUERY && dismissedFor !== query;
  // During the debounce window nothing is in flight yet, so `loading` is false while `results` is
  // still empty (or left over from the previous keystroke) — reporting either as the answer for
  // what was just typed is wrong. `isCurrent` covers that gap; the input's own spinner keeps using
  // `loading`, so it only spins on a real request.
  const pending = loading || !isCurrent;
  /** The listbox is in the DOM — what `aria-expanded` has to agree with, not merely "popup shown". */
  const expanded = open && !pending && results.length > 0;

  // A new query invalidates the position within the old suggestions, and leaving
  // `aria-activedescendant` on an id that no longer exists points the screen reader at nothing.
  // Adjusted during render, which is React's documented answer to "reset state when its input
  // changed" and costs no extra pass — the same shape MobileSearchInput uses. The key is built
  // from primitives on purpose: `results` is a fresh `[]` on every render while the query is too
  // short to search, so comparing it by identity would re-run this forever.
  const resetKey = `${query}|${open}`;
  const [seenResetKey, setSeenResetKey] = useState(resetKey);
  if (seenResetKey !== resetKey) {
    setSeenResetKey(resetKey);
    setActiveIndex(-1);
  }

  const goToProduct = useCallback(
    (product: AutocompleteProduct) => {
      setQuery("");
      setActiveIndex(-1);
      // Same intercepted quick-view modal as ProductCard — see the note there on `scroll: false`.
      // The push moved up here from the dropdown when the options stopped being buttons, so this
      // flag had to come with it.
      router.push(`/product/${product.id}`, { scroll: false });
    },
    [router],
  );

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setQuery("");
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      close();
      setActiveIndex(-1);
      return;
    }
    if (!expanded) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // The browser would otherwise move the caret to either end of the query.
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      // Wrapping through -1 rather than only across the options, so the list can always be left
      // again without deleting anything: one more press returns to the text that was typed.
      const span = results.length + 1;
      setActiveIndex((i) => ((i + 1 + step + span) % span) - 1);
      return;
    }
    if (e.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      // Enter on a highlighted suggestion opens it; the form's submit — search for the raw text —
      // stays the behaviour when nothing is highlighted.
      e.preventDefault();
      goToProduct(results[activeIndex]);
    }
  };

  return (
    <form ref={searchRef} onSubmit={handleSubmit} role="search" className={cn("relative flex flex-1", className)}>
      <SearchInput
        searchPath="/search"
        value={query}
        onChange={setQuery}
        loading={loading}
        inputProps={{
          role: "combobox",
          "aria-expanded": expanded,
          "aria-controls": expanded ? listboxId : undefined,
          "aria-activedescendant": activeIndex >= 0 ? optionId(activeIndex) : undefined,
          "aria-autocomplete": "list",
          autoComplete: "off",
          onKeyDown: handleKeyDown,
        }}
      />

      {open && (
        <AutocompleteDropdown
          results={results}
          loading={pending}
          activeIndex={activeIndex}
          listboxId={listboxId}
          optionId={optionId}
          onSelect={goToProduct}
          onHover={setActiveIndex}
        />
      )}

      {/*
        Mounted always, and empty until there is something to say: a live region inserted together
        with its first message is routinely missed, the same reason components/Toaster.tsx keeps its
        container. Without it the suggestions appeared and vanished in silence — `aria-expanded`
        reports that a list exists, not how much is in it.
      */}
      <div role="status" aria-live="polite" className="sr-only">
        {open && !pending ? (results.length > 0 ? `Найдено совпадений: ${results.length}` : "Ничего не найдено") : ""}
      </div>
    </form>
  );
}
