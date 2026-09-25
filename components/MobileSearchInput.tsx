"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SearchInput, { SearchBarProps } from "./SearchInput";

type MobileSearchInputProps = Pick<SearchBarProps, "searchPath"> & {
  defaultValue?: string;
};

export default function MobileSearchInput({ searchPath, defaultValue = "" }: MobileSearchInputProps) {
  const [query, setQuery] = useState(defaultValue);
  const [seenDefault, setSeenDefault] = useState(defaultValue);
  const [pushed, setPushed] = useState(defaultValue);
  const router = useRouter();

  // Must stay a pure "did the prop change" check: comparing with `pushed` resets the field mid-navigation.
  if (seenDefault !== defaultValue) {
    setSeenDefault(defaultValue);
    if (defaultValue !== pushed) {
      setPushed(defaultValue);
      setQuery(defaultValue);
    }
  }

  // Skip a query already pushed or already in the URL: avoids duplicate pushes and history entries.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === pushed || trimmed === defaultValue) return;

    const timer = setTimeout(() => {
      setPushed(trimmed);
      router.push(trimmed ? `${searchPath}?q=${encodeURIComponent(trimmed)}` : searchPath);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, pushed, defaultValue, router, searchPath]);

  return (
    <SearchInput searchPath={searchPath} value={query} onChange={setQuery} loading={query.trim() !== defaultValue} />
  );
}
