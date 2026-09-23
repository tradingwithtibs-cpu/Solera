"use client";

import "./portfolio.css";
import { PanelGrid } from "@/components/panels/PanelGrid";
import { ResetLayoutLink } from "@/components/panels/ResetLayoutLink";
import { HeroPanel } from "./HeroPanel";
import { SincePanel } from "./SincePanel";
import { PositionsPanel } from "./PositionsPanel";
import { PlansPanel } from "./PlansPanel";
import { FillsPanel } from "./FillsPanel";

/** The portfolio grid: hero 8 | since 4 / positions 8 | plans 4 / recent fills 12 (docs/port/layout-engine.md §5.1). */
export function PortfolioGrid() {
  return (
    <>
      <PanelGrid page="portfolio" phoneTab="portfolio">
        <HeroPanel id="hero" />
        <SincePanel id="since" />
        <PositionsPanel id="positions" />
        <PlansPanel id="plans" />
        <FillsPanel id="activity" />
      </PanelGrid>
      <p className="px-6 pb-4 text-center text-[10px] uppercase tracking-wider text-muted">
        <ResetLayoutLink page="portfolio" />
      </p>
    </>
  );
}
