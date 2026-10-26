import { Suspense } from "react";
import VaultDetail from "@/components/earn/VaultDetail";

// The page reads its market from the URL (useSearchParams), which static export needs inside Suspense.
export default function Page() {
  return (
    <Suspense>
      <VaultDetail />
    </Suspense>
  );
}
