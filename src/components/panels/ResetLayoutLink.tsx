"use client";

import { usePageLayout } from "@/hooks/use-page-layout";
import type { PageId } from "@/lib/layout";

/** Appears only while the page's layout differs from the designed one. */
export function ResetLayoutLink({ page }: { page: PageId }) {
  const { isCustom, reset } = usePageLayout(page);
  if (!isCustom) return null;
  return (
    <button type="button" className="reset-layout" onClick={reset}>
      Reset layout
    </button>
  );
}
