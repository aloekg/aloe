"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SearchInput, { SearchBarProps } from "./SearchInput";

type MobileSearchInputProps = Pick<SearchBarProps, "searchPath"> & {
  defaultValue?: string;
};

export default function MobileSearchInput({ searchPath, defaultValue = "" }: MobileSearchInputProps) {
  const [query, setQuery] = useState(defaultValue);
  /** The last `defaultValue` this field has seen, so a re-render can tell a moved URL from any other render. */
  const [seenDefault, setSeenDefault] = useState(defaultValue);
  /** The last query handed to the router — still in flight until `defaultValue` catches up with it. */
  const [pushed, setPushed] = useState(defaultValue);
  const router = useRouter();

  // Adjusting during render is React's documented way to react to a prop change; an effect would
  // cause a cascading re-render, and a `key` on the parent would remount the field mid-typing.
  //
  // The condition has to be a pure "did the prop change", not "does the prop still disagree with
  // what we pushed": the push and the URL it produces are a navigation apart, so the latter was
  // true on every render in between and reset the field to the URL's old value. Typing then
  // cleared the input the moment the debounce fired, restored it when the navigation landed, and
  // — when each restore raced the next keystroke — made every letter overwrite the one before it.
  if (seenDefault !== defaultValue) {
    setSeenDefault(defaultValue);
    // Our own navigation arriving carries a query the field has already moved past, so only a URL
    // that moved on its own (back/forward, or a server navigation) is worth following.
    if (defaultValue !== pushed) {
      setPushed(defaultValue);
      setQuery(defaultValue);
    }
  }

  // Two effects used to race here. On /search?q=foo the first pushed the URL the browser was
  // already on — an extra RSC round trip plus a duplicate history entry, so "back" needed two
  // presses. The second pushed searchPath whenever the field was empty, which also fired on
  // mount, and SearchInput's clear button pushes too, making that a second redundant push.
  // Skipping a query that is already pushed, or already in the address bar, covers all three.
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
