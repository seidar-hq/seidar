import { Suspense } from "react";
import LendPool from "@/components/earn/LendPool";

// The page reads its pool from the URL (useSearchParams), which static export needs inside Suspense.
export default function Page() {
  return (
    <Suspense>
      <LendPool />
    </Suspense>
  );
}
