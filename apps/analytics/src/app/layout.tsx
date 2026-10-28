import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeRegistry from "@/theme/ThemeRegistry";
import { AdminProvider } from "@/admin/AdminContext";

export const metadata: Metadata = {
  metadataBase: new URL("https://analytics.seidar.xyz"),
  title: "Seidar Analytics",
  description: "Live, on-chain-verifiable usage of Seidar, the non-custodial DeFi workspace for Stellar.",
  icons: { icon: "/assets/favicon.svg" },
  openGraph: {
    title: "Seidar Analytics",
    description: "Live, on-chain-verifiable usage of Seidar on Stellar mainnet.",
    images: ["/assets/seidar-icon-256.png"],
  },
};

export const viewport: Viewport = { themeColor: "#141414", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>
          <AdminProvider>{children}</AdminProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
