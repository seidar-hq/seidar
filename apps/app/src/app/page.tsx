"use client";

import dynamic from "next/dynamic";
import Portfolio from "@/components/portfolio/Portfolio";

// "/" is Home once it ships; until then it stays Portfolio (see lib/features.ts). The env check
// is inline so production builds (flag unset) drop the Home import and never ship its code.
const Home = process.env.NEXT_PUBLIC_ENABLE_HOME === "1" ? dynamic(() => import("@/components/home/Home")) : null;

export default function Page() {
  return Home ? <Home /> : <Portfolio />;
}
