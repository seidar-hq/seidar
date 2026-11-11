"use client";

import { useEffect } from "react";

// Bridge now lives under Trade (Swap · Bridge · Perps). Old links and bookmarks land there.
export default function Page() {
  useEffect(() => {
    window.location.replace("/trade-swap/bridge" + window.location.search);
  }, []);
  return null;
}
