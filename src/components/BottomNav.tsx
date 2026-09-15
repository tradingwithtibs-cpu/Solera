"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FeedIcon, MarketsIcon, TrophyIcon, WalletIcon } from "./icons";
export const TABS = [
  { href: "/", label: "Discover", Icon: FeedIcon },
  { href: "/markets", label: "Markets", Icon: MarketsIcon },
  { href: "/leaderboard", label: "Leaderboard", Icon: TrophyIcon },
  { href: "/portfolio", label: "Portfolio", Icon: WalletIcon },
] as const;
export function BottomNav({ desktop = false }: { desktop?: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={desktop ? "Main navigation" : "Mobile navigation"}
      className={desktop ? "desktop-nav" : "mobile-nav"}
    >
      {TABS.map(({ href, label, Icon }) => {
        const active =
          pathname === href ||
          (href === "/markets" && pathname.startsWith("/asset")) ||
          (href === "/portfolio" && (pathname === "/activity" || pathname.startsWith("/buy")));
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}>
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
