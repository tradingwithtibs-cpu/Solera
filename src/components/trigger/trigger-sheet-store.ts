"use client";

import { useSyncExternalStore } from "react";

/**
 * Which live-plan sheet is open (arm or cancel) and for which plan. Any
 * card or row calls openArmPlanSheet(planId); the host in AppShell renders
 * it. `resume` carries a Jupiter token that an iOS hop already earned.
 */
export interface TriggerSheetState {
  kind: "arm" | "cancel" | null;
  planId: string | null;
  resume?: { jwt?: string; exp?: number };
  /** Bumps whenever a plan was armed or cancelled through a sheet, so plan lists can refetch. */
  version: number;
}

let state: TriggerSheetState = { kind: null, planId: null, version: 0 };
const listeners = new Set<() => void>();

function set(next: Partial<TriggerSheetState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function openArmPlanSheet(planId: string, resume?: TriggerSheetState["resume"]) {
  set({ kind: "arm", planId, resume });
}

export function openCancelPlanSheet(planId: string, resume?: TriggerSheetState["resume"]) {
  set({ kind: "cancel", planId, resume });
}

export function closeTriggerSheet() {
  set({ kind: null, planId: null, resume: undefined });
}

/** Called by the sheets after a change lands; plan lists subscribe through useTriggerSheet().version. */
export function notifyPlansChanged() {
  set({ version: state.version + 1 });
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("solera:plans-changed"));
}

export function getTriggerSheetState(): TriggerSheetState {
  return state;
}

const SERVER: TriggerSheetState = { kind: null, planId: null, version: 0 };

export function useTriggerSheet(): TriggerSheetState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => SERVER,
  );
}
