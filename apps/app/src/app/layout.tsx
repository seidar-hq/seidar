import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeRegistry from "@/theme/ThemeRegistry";
import AppShell from "@/components/layout/AppShell";
import { WalletProvider } from "@/wallet/WalletContext";

export const metadata: Metadata = {
  title: "Seidar | Stellar DeFi Portfolio and Execution Platform",
  description:
    "Connect your Stellar wallets, analyse positions and exposure, and trade, earn and bridge across Stellar DeFi without giving up custody.",
  icons: { icon: "/assets/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#1a1a1a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The wallet kit writes its CSS variables onto <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeRegistry>
          <WalletProvider>
            <AppShell>{children}</AppShell>
          </WalletProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
