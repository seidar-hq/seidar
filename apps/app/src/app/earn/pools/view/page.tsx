import { Suspense } from "react";
import PoolPage from "@/components/earn/PoolPage";

// The page reads its market from the URL (useSearchParams), which static export needs inside Suspense.
export default function Page() {
  return (
    <Suspense>
      <PoolPage />
    </Suspense>
  );
}
