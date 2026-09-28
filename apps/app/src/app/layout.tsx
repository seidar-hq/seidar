import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./shell.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Seidar App — Portfolio & Automation",
  description:
    "Track, leverage, shift and automate Blend, XOXNO and Peridot positions on Stellar.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-black text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
