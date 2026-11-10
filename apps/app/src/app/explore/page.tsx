"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";

// Explore is on trial next to Home and ships with it (lib/features.ts): with Home off it isn't
// built at all and the URL goes to "/".
const Explore = process.env.NEXT_PUBLIC_ENABLE_HOME === "1" ? dynamic(() => import("@/components/explore/Explore")) : null;

function ToHome() {
  useEffect(() => {
    window.location.replace("/");
  }, []);
  return null;
}

export default function Page() {
  return Explore ? <Explore /> : <ToHome />;
}
