"use client";

import { Suspense, useEffect } from "react";
import dynamic from "next/dynamic";

// The asset page belongs to Home (lib/features.ts): with Home off it isn't shipped at all and
// the URL goes to "/". The asset comes from ?asset=CODE:ISSUER; useSearchParams needs Suspense.
const Asset = process.env.NEXT_PUBLIC_ENABLE_HOME === "1" ? dynamic(() => import("@/components/asset/Asset")) : null;

function ToHome() {
  useEffect(() => {
    window.location.replace("/");
  }, []);
  return null;
}

export default function Page() {
  return <Suspense fallback={null}>{Asset ? <Asset /> : <ToHome />}</Suspense>;
}
