"use client";

import { useSyncExternalStore } from "react";

/**
 * Who opens the auth sheet, and on which view. A module store so the
 * shell's LOG IN / SIGN UP buttons, the me-pill, a "Sign in to vote"
 * tooltip or a `?auth=` link can all open the one sheet that
 * AuthSheetHost mounts app-wide, without threading a context through.
 */
export type AuthSheetMode = "login" | "signup" | "account";

export interface AuthSheetState {
  open: boolean;
  mode: AuthSheetMode;
}

const CLOSED: AuthSheetState = { open: false, mode: "signup" };
let state: AuthSheetState = CLOSED;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function isAuthSheetMode(value: unknown): value is AuthSheetMode {
  return value === "login" || value === "signup" || value === "account";
}

/** Opens the sheet on the given view; a second call while open just switches the view. */
export function openAuthSheet(mode: AuthSheetMode = "signup") {
  state = { open: true, mode };
  emit();
}

export function closeAuthSheet() {
  if (!state.open) return;
  state = { open: false, mode: state.mode };
  emit();
}

/** Switches the Log in / Sign up tab of an open sheet. */
export function setAuthSheetMode(mode: AuthSheetMode) {
  if (!state.open || state.mode === mode) return;
  state = { open: true, mode };
  emit();
}

export function getAuthSheetState(): AuthSheetState {
  return state;
}

export function subscribeAuthSheet(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAuthSheet(): AuthSheetState {
  return useSyncExternalStore(subscribeAuthSheet, getAuthSheetState, () => CLOSED);
}
