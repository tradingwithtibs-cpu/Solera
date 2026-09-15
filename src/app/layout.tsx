import type { Metadata, Viewport } from "next";
import { Outfit, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { SolanaProvider } from "@/components/SolanaProvider";
import { LivePriceLoader } from "@/components/LivePriceLoader";

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

const SITE_URL = "https://stocklana.vercel.app";
const DESCRIPTION = "Follow real investors, see their real holdings, copy with one tap.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Stocklana",
  description: DESCRIPTION,
  openGraph: {
    title: "Stocklana",
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Stocklana",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stocklana",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${figuresFont.variable} h-full`}>
      <body className="h-full antialiased">
        <SolanaProvider>
          <LivePriceLoader />
          <AppShell>{children}</AppShell>
        </SolanaProvider>
      </body>
    </html>
  );
}
