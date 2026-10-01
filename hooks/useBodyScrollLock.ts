"use client";

import { useEffect } from "react";

// Ref-counted so overlapping overlays cannot release each other's lock.
let locks = 0;
let previousOverflow = "";

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    if (locks === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    locks++;

    return () => {
      locks--;
      if (locks === 0) document.body.style.overflow = previousOverflow;
    };
  }, [locked]);
}
