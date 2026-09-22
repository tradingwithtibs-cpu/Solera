"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSelectedTicker } from "@/hooks/use-selected-ticker";
import { AgentIcon, FeedIcon, MarketsIcon, TrophyIcon, WalletIcon } from "./icons";

function TradeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 17l5-6 3 3 6-8" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 6h4v4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The phone tab bar: six tabs, the sliding era indicator, glass. The Trade
 * tab opens the last ticker looked at. Hidden at desktop widths by CSS.
 */
export function BottomNav() {
  const pathname = usePathname();
  const [selected] = useSelectedTicker();
  const tabs = [
    { key: "portfolio", href: "/portfolio", label: "Portfolio", Icon: WalletIcon, active: pathname === "/portfolio" || pathname === "/activity" },
    { key: "markets", href: "/markets", label: "Markets", Icon: MarketsIcon, active: pathname === "/markets" || pathname === "/pre-ipo" },
    { key: "trade", href: `/asset/${selected}`, label: "Trade", Icon: TradeIcon, active: pathname.startsWith("/asset/") || pathname.startsWith("/buy/") },
    { key: "discover", href: "/", label: "Discover", Icon: FeedIcon, active: pathname === "/" || pathname === "/news" },
    { key: "people", href: "/leaderboard", label: "People", Icon: TrophyIcon, active: pathname === "/leaderboard" || pathname.startsWith("/investor/") },
    { key: "agent", href: "/agent", label: "Agent", Icon: AgentIcon, active: pathname === "/agent" },
  ];
  const index = Math.max(0, tabs.findIndex((t) => t.active));
  return (
    <nav aria-label="Sections" className="tabbar glass" style={{ "--i": index, "--n": tabs.length } as React.CSSProperties}>
      {tabs.map(({ key, href, label, Icon, active }) => (
        <Link key={key} href={href} aria-current={active ? "page" : undefined}>
          <Icon className="h-5 w-5" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
