import { Suspense } from "react";
import { PreIpoGrid } from "@/components/preipo/PreIpoGrid";

/**
 * /pre-ipo: the pre-IPO market list, the selected token with its ticket,
 * and the two-issuer comparisons, on the panel grid. The grid reads ?sym=
 * and ?mint= with useSearchParams, so it sits under a Suspense boundary.
 */
export default function PreIpoPage() {
  return (
    <Suspense fallback={null}>
      <PreIpoGrid />
    </Suspense>
  );
}
