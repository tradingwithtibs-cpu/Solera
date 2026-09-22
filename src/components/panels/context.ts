"use client";

import { createContext, useContext } from "react";
import type { DropAxis, DropZone, PageId, Placed } from "@/lib/layout";

export interface PanelSlot {
  page: PageId;
  id: string;
  title: string;
  placed: Placed | null;
  isSized: boolean;
  isDragging: boolean;
  isResizing: boolean;
  over: { zone: DropZone; axis: DropAxis } | null;
  grabbed: boolean;
  phoneOrder: number | null;
  phoneHidden: boolean;
  gridHelpId: string;
  /** True on desktop widths, where the handles do anything. */
  interactive: boolean;
  badge: string | null;
  reportRows: (id: string, rows: number) => void;
  onGripPointerDown: (e: React.PointerEvent<HTMLButtonElement>, id: string) => void;
  onGripKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>, id: string) => void;
  onResizePointerDown: (e: React.PointerEvent<HTMLButtonElement>, id: string) => void;
  onResizeDoubleClick: (id: string) => void;
  onResizeKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>, id: string) => void;
}

export const PanelSlotContext = createContext<PanelSlot | null>(null);

export function usePanelSlot(): PanelSlot | null {
  return useContext(PanelSlotContext);
}
