"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Updates = Record<string, string | number | null | undefined>;

export function useAdminListNav(defaults: Record<string, string> = {}) {
  const router = useRouter();

  function navigate(updates: Updates) {
    const params = new URLSearchParams(window.location.search);
    let resetPage = false;

    for (const [key, value] of Object.entries(updates)) {
      if (key === "page") continue;
      resetPage = true;
      const str = value == null ? "" : String(value);
      if (str && str !== defaults[key]) params.set(key, str);
      else params.delete(key);
    }

    if ("page" in updates) {
      const page = Number(updates.page) || 1;
      if (page > 1) params.set("page", String(page));
      else params.delete("page");
    } else if (resetPage) {
      params.delete("page");
    }

    router.replace(`?${params.toString()}`);
  }

  return navigate;
}

export function useDebouncedSearch(initial: string, onSearch: (value: string) => void, delay = 400) {
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(next), delay);
  }

  function clear() {
    setValue("");
    if (timer.current) clearTimeout(timer.current);
    onSearch("");
  }

  return { value, onChange, clear };
}
