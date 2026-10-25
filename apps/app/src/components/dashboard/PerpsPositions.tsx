"use client";

import { EmptyState } from "@/components/common/DataTable";

// Zenex (Stellar perps) positions. The integration is pending, so the tab says so plainly.
export default function PerpsPositions({ addresses }: { addresses: string[] }) {
  return (
    <EmptyState
      message={
        addresses.length
          ? "Zenex perps positions will appear here once perps trading is enabled in Seidar."
          : "Connect a wallet to view your perps positions."
      }
    />
  );
}
