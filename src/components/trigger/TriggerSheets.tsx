"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { plansClient } from "@/lib/plans-client";
import type { Plan } from "@/lib/plans";
import { ArmPlanSheet } from "./ArmPlanSheet";
import { CancelPlanSheet } from "./CancelPlanSheet";
import { closeTriggerSheet, useTriggerSheet } from "./trigger-sheet-store";

/** Mounted once in AppShell: fetches the plan the store names and shows the right sheet. */
export function TriggerSheets() {
  const { kind, planId, resume } = useTriggerSheet();
  const { token } = useSession();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kind || !planId || !token) return;
    let cancelled = false;
    plansClient
      .get(token, planId)
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load the plan.");
      });
    return () => {
      cancelled = true;
    };
  }, [kind, planId, token]);

  useEffect(() => {
    if (!kind) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the sheet's plan when it closes
      setPlan(null);
      setError(null);
    }
  }, [kind]);

  if (!kind || !planId) return null;
  if (!token) return null;
  const close = () => closeTriggerSheet();
  if (kind === "arm") return <ArmPlanSheet plan={plan} planId={planId} loadError={error} sessionToken={token} resume={resume} onClose={close} />;
  return <CancelPlanSheet plan={plan} loadError={error} sessionToken={token} resume={resume} onClose={close} />;
}
