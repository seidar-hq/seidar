import { Suspense } from "react";
import LendView from "@/components/earn/LendView";

// The page reads its pool from the URL (useSearchParams), which static export needs inside Suspense.
export default function Page() {
  return (
    <Suspense>
      <LendView />
    </Suspense>
  );
}
