"use client";

import "./people.css";
import { PanelGrid } from "@/components/panels/PanelGrid";
import { ResetLayoutLink } from "@/components/panels/ResetLayoutLink";
import { PeoplePanel } from "./PeoplePanel";

/** /leaderboard: the People card on the panel grid (layout-engine.md §5.5), with the holder-overlap hover. */
export function PeopleGrid() {
  return (
    <>
      <PanelGrid page="leaderboard" phoneTab="people">
        <PeoplePanel id="people" />
      </PanelGrid>
      <p className="px-6 pb-4 text-center text-[10px] uppercase tracking-wider text-muted">
        <ResetLayoutLink page="leaderboard" />
      </p>
    </>
  );
}
