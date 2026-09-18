import Link from "next/link";
import { BottomNav } from "./BottomNav";
import { Logo } from "./Logo";
import { SidebarAccount } from "./SidebarAccount";
import { DiscoveryRail } from "./DiscoveryRail";
import { ModeStrip } from "./ModeStrip";
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/" className="sidebar-logo">
          <span className="brand-symbol" aria-hidden="true">
            s
          </span>
          <Logo className="text-xl" />
        </Link>
        <p className="eyebrow mt-3 mb-9">A little more perspective.</p>
        <BottomNav desktop />
        <div className="sidebar-bottom">
          <div className="rounded-2xl border border-neutral-200 p-4">
            <p className="text-sm font-semibold">Built for the long view.</p>
            <p className="mt-2 text-xs leading-relaxed text-neutral-500">
              People, portfolios, and the thinking behind them.
            </p>
            <span className="text-gradient-solana mt-3 inline-block text-xs font-semibold">Built on Solana ↗</span>
          </div>
          <SidebarAccount />
        </div>
      </aside>
      <div className="content-column">
        <ModeStrip />
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <DiscoveryRail />
      <BottomNav />
    </div>
  );
}
