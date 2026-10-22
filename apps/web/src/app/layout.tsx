import type { Metadata } from "next";
import { Suspense } from "react";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import "./globals.css";
import ThemeRegistry from "@/theme/ThemeRegistry";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Seidar | Stellar DeFi, all in one place",
  description:
    "Discover protocols, manage portfolios, and turn portfolio data into intelligence. Power agentic workflows across Stellar DeFi.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>
          <Suspense fallback={null}>
            <Navbar />
          </Suspense>
          {children}
          <Footer />
        </ThemeRegistry>
      </body>
    </html>
  );
}
