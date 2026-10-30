"use client";

import { useEffect } from "react";

// The dashboard is now Portfolio: keep old links and bookmarks working (query string included,
// e.g. the ?watch= test hook). A plain location.replace: no extra history entry, works in the
// static export.
export default function Page() {
  useEffect(() => {
    window.location.replace(`/portfolio${window.location.search}`);
  }, []);
  return null;
}
