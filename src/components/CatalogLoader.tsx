"use client";

import { useEffect } from "react";
import { registerCatalog, type CatalogToken } from "@/lib/catalog";
import { setLivePrice } from "@/lib/live-prices";
import { isFeatured } from "@/lib/catalog";

/**
 * Mounted once near the root. Loads the full token catalog and seeds the
 * live-price store with each token's hourly Jupiter price, so every
 * tokenized stock has a price the moment it's on screen. Featured tickers
 * keep their faster polling in LivePriceLoader; anything the user opens
 * gets its own 5-second polling via useLivePriceFor.
 */
export function CatalogLoader() {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog")
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { tokens: CatalogToken[] };
        if (cancelled) return;
        registerCatalog(data.tokens);
        for (const t of data.tokens) {
          if (!isFeatured(t.symbol) && t.usdPrice) setLivePrice(t.symbol, t.usdPrice);
        }
      })
      .catch(() => {
        // The featured eight still work without the catalog.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
