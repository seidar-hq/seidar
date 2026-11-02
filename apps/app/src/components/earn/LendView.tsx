"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import LendPool from "./LendPool";

// Templar markets have their own page (read-only, dev only until reviewed: lib/features.ts). The env check
// is inline so production builds without the flag drop TemplarMarket entirely.
const TemplarMarket = process.env.NEXT_PUBLIC_ENABLE_TEMPLAR === "1" ? dynamic(() => import("./TemplarMarket")) : null;

/** /earn/lending&borrow/view: a Blend pool or XOXNO hub (LendPool), or a Templar market. */
export default function LendView() {
  const protocol = useSearchParams().get("protocol");
  if (TemplarMarket && protocol === "templar") return <TemplarMarket />;
  return <LendPool />;
}
