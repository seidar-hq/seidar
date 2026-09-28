import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Seidar — Manage, Leverage & Automate DeFi on Stellar",
  description:
    "Create, leverage, shift and automate lending positions on Blend, XOXNO and Peridot in one transaction. Smart accounts, keepers, gas credits.",
  applicationName: "Seidar",
  authors: [{ name: "Seidar" }],
  keywords: [
    "seidar",
    "Stellar",
    "Soroban",
    "Blend",
    "XOXNO",
    "Peridot",
    "DeFi",
    "leverage",
    "automation",
  ],
  robots: "index, follow",
  openGraph: {
    title: "Seidar — Manage, Leverage & Automate DeFi on Stellar",
    description:
      "Boost, repay, shift and automate lending positions on Stellar in one transaction.",
    url: "https://seidar.xyz",
    siteName: "Seidar",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@seidarso",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-black text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
