import { Suspense } from "react";
import Asset from "@/components/asset/Asset";

// The asset comes from the URL (?asset=CODE:ISSUER); useSearchParams needs a Suspense boundary
// for the static export.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Asset />
    </Suspense>
  );
}
