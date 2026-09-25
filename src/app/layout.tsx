import type { Metadata, Viewport } from "next";
import { Outfit, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { SolanaProvider } from "@/components/SolanaProvider";
import { LivePriceLoader } from "@/components/LivePriceLoader";
import { CatalogLoader } from "@/components/CatalogLoader";

// "Gradient Native" direction: Outfit for display/UI (rounder and warmer
// than a plain grotesk), IBM Plex Mono for every price and balance — see
// the design-directions pitch this was picked from.
const displayFont = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const figuresFont = IBM_Plex_Mono({
  variable: "--font-figures",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const SITE_URL = "https://trysolera.vercel.app";
const DESCRIPTION = "Stocks on Solana, with the people who hold them. Live xStock prices, real on-chain investors, swaps from your own wallet, and an agent that never signs.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Solera",
  description: DESCRIPTION,
  openGraph: {
    title: "Solera",
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Solera",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Solera",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0d16",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${figuresFont.variable} h-full`}>
      <body className="h-full antialiased">
        <SolanaProvider>
          <LivePriceLoader />
          <CatalogLoader />
          <AppShell>{children}</AppShell>
        </SolanaProvider>
      </body>
    </html>
  );
}
