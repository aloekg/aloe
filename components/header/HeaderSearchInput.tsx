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
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
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
  // `isCurrent` covers the debounce gap, where `loading` is false but results are stale.
  const pending = loading || !isCurrent;
  const expanded = open && !pending && results.length > 0;

  // Reset during render. Key built from primitives: `results` is a fresh [] each render and would loop.
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
      // scroll: false, same as ProductCard: the fixed modal otherwise sends the page behind it to the top.
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
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const span = results.length + 1;
      setActiveIndex((i) => ((i + 1 + step + span) % span) - 1);
      return;
    }
    if (e.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
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

      {/* Always mounted: a live region inserted together with its first message is often missed. */}
      <div role="status" aria-live="polite" className="sr-only">
        {open && !pending ? (results.length > 0 ? `Найдено совпадений: ${results.length}` : "Ничего не найдено") : ""}
      </div>
    </form>
  );
}
