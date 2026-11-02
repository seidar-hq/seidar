"use client";

import { Suspense, useEffect } from "react";
import dynamic from "next/dynamic";

// Discover is dev-only until it ships (lib/features.ts). The env check is inline so production
// builds drop the import and never ship its code; there the URL goes to "/".
// The wallet being viewed comes from ?address=G…; useSearchParams needs Suspense.
const Discover = process.env.NEXT_PUBLIC_ENABLE_DISCOVER === "1" ? dynamic(() => import("@/components/discover/Discover")) : null;

function ToHome() {
  useEffect(() => {
    window.location.replace("/");
  }, []);
  return null;
}

export default function Page() {
  return <Suspense fallback={null}>{Discover ? <Discover /> : <ToHome />}</Suspense>;
}
