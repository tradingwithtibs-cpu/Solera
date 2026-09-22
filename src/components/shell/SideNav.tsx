"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "../Logo";
import { SidebarAccount } from "../SidebarAccount";
import { AgentIcon, FeedIcon, MarketsIcon, RocketIcon, TrophyIcon, WalletIcon } from "../icons";

export const NAV_ITEMS = [
  { href: "/portfolio", label: "Portfolio", Icon: WalletIcon, active: (p: string) => p === "/portfolio" || p === "/activity" || p.startsWith("/buy/") },
  { href: "/", label: "Discover", Icon: FeedIcon, active: (p: string) => p === "/" || p === "/news" },
  { href: "/markets", label: "Markets", Icon: MarketsIcon, active: (p: string) => p === "/markets" || p.startsWith("/asset/") },
  { href: "/pre-ipo", label: "Pre-IPO", Icon: RocketIcon, active: (p: string) => p === "/pre-ipo" },
  { href: "/leaderboard", label: "Leaderboard", Icon: TrophyIcon, active: (p: string) => p === "/leaderboard" || p.startsWith("/investor/") },
  { href: "/agent", label: "Agent", Icon: AgentIcon, active: (p: string) => p === "/agent" },
] as const;

/** Desktop navigation: the mark, six sections, the long-view card, and the account block. */
export function SideNav() {
  const pathname = usePathname();
  return (
    <aside className="sidenav" aria-label="Main navigation">
      <Link href="/" className="side-brand" aria-label="Solera home">
        <Logo size={40} />
      </Link>
      <p className="side-tag">A little more perspective.</p>
      <ul>
        {NAV_ITEMS.map(({ href, label, Icon, active }) => (
          <li key={href}>
            <Link href={href} aria-current={active(pathname) ? "page" : undefined}>
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="side-foot">
        <b>Built for the long view.</b>
        <br />
        People, portfolios, and the thinking behind them.
        <br />
        <span className="text-gradient-solana mt-2 inline-block">Built on Solana ↗</span>
      </div>
      <SidebarAccount />
    </aside>
  );
}
