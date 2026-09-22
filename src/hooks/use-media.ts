"use client";

import { useSyncExternalStore } from "react";

/**
 * matchMedia as a store. Server snapshot is false, so this only ever gates
 * interactions after mount; it never changes what is rendered.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      // Viewport emulation and some embedded browsers resize without a media "change" event.
      window.addEventListener("resize", onChange);
      return () => {
        mql.removeEventListener("change", onChange);
        window.removeEventListener("resize", onChange);
      };
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
