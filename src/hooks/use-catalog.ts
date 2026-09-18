"use client";

import { useSyncExternalStore } from "react";
import { getCatalogTokens, getCatalogVersion, isCatalogLoaded, subscribeCatalog, type CatalogToken } from "@/lib/catalog";

/** The full tokenized-stock catalog, most liquid first, re-rendering when it loads. */
export function useCatalog(): { tokens: CatalogToken[]; isLoaded: boolean } {
  useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
  return { tokens: getCatalogTokens(), isLoaded: isCatalogLoaded() };
}
