"use client";

import { PerpsLocked } from "./TradeLocked";

// Zenex perps (the Stellar perps venue). Trading is not enabled in Seidar yet, so the page keeps its
// locked layout until the integration lands.
export default function Perps() {
  return <PerpsLocked />;
}
