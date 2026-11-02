"use client";

import { useSearchParams } from "next/navigation";
import { isAddress } from "./discoverData";
import DiscoverLanding from "./DiscoverLanding";
import WalletProfile from "./WalletProfile";

/** /discover: the landing page, or a wallet's profile with ?address=G…. */
export default function Discover() {
  const raw = (useSearchParams().get("address") ?? "").trim().toUpperCase();
  return isAddress(raw) ? <WalletProfile key={raw} address={raw} /> : <DiscoverLanding />;
}
