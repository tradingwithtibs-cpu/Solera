import { BottomNav } from "./BottomNav";
import { SideNav } from "./shell/SideNav";
import { Tape } from "./shell/Tape";
import { Masthead } from "./shell/Masthead";
import { Strip } from "./shell/Strip";
import { Foot } from "./shell/Foot";
import { Palette } from "./shell/Palette";
import { HolderHighlight } from "./people/HolderHighlight";
import { TriggerSheets } from "./trigger/TriggerSheets";

/**
 * The frame every route renders in: sidenav on desktop, then the content
 * column (tape, glass top bar, chip strip, the page, footer). Phones get the
 * six-tab bar instead of the sidenav. The ⌘K palette mounts once here.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <SideNav />
      <div className="content">
        <Tape />
        <Masthead />
        <Strip />
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <Foot />
      </div>
      <BottomNav />
      <Palette />
      <HolderHighlight />
      <TriggerSheets />
    </div>
  );
}
