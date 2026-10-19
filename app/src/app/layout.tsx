import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "./globals.css";
import "./shell.css";

export const metadata: Metadata = {
  title: "Seidar App — Portfolio & Automation",
  description:
    "Track, leverage, shift and automate Blend and XOXNO positions on Stellar.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Stellar Wallets Kit writes its theme variables (--swk-*) onto <html>
    // as soon as its module loads, before hydration; only this element's own
    // attributes are exempt from the mismatch check.
    <html lang="en" className="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="bg-[#0F0F0F] text-white antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
