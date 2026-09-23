"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { closeAuthSheet, isAuthSheetMode, openAuthSheet, useAuthSheet } from "./auth-sheet-store";
import { AuthSheet } from "./AuthSheet";

/**
 * `?auth=login|signup|account` opens the sheet on arrival (a "Sign in to
 * vote" link, or the return leg of an email flow), then drops the
 * parameter so a reload or a Back doesn't reopen it.
 */
function QueryOpener() {
  const params = useSearchParams();
  const wanted = params.get("auth");
  useEffect(() => {
    if (!isAuthSheetMode(wanted)) return;
    openAuthSheet(wanted);
    const url = new URL(window.location.href);
    url.searchParams.delete("auth");
    window.history.replaceState(window.history.state, "", url);
  }, [wanted]);
  return null;
}

/** Mounted once, app-wide (SolanaProvider), so `openAuthSheet()` works from anywhere. */
export function AuthSheetHost() {
  const { open, mode } = useAuthSheet();
  return (
    <>
      <Suspense fallback={null}>
        <QueryOpener />
      </Suspense>
      {open && <AuthSheet mode={mode} onClose={closeAuthSheet} />}
    </>
  );
}
