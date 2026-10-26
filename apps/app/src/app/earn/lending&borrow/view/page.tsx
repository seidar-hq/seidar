import { Suspense } from "react";
import LendMarket from "@/components/earn/LendMarket";

// The page reads its market from the URL (useSearchParams), which static export needs inside Suspense.
export default function Page() {
  return (
    <Suspense>
      <LendMarket />
    </Suspense>
  );
}
