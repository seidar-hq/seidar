"use client";

// Demo portfolio for screenshots and walkthroughs. DEV SERVER ONLY.
//
// Turn on: open any page with `?demo` (remembered in this browser), off with `?demo=0`. A wallet
// must be connected (or `?watch=G...` in dev); its real balances and positions are replaced by the
// figures in demo-data.ts, and charts are drawn from its price changes (no API needed).
//
// Production builds never contain the figures: the require below sits in a branch the bundler
// removes when NODE_ENV is "production" (checked: none of them appear in the exported bundle).

type Data = typeof import("./demo-data");

const data: Data | null =
  process.env.NODE_ENV !== "production"
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("./demo-data") as Data)
    : null;

function detect(): boolean {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search).get("demo");
  if (q === "0") window.localStorage.removeItem("seidar.demo");
  else if (q != null) window.localStorage.setItem("seidar.demo", "1");
  return window.localStorage.getItem("seidar.demo") === "1";
}

export const DEMO = data != null && detect();

/** The demo figures; only read behind a `DEMO` check. */
export const demo = data as Data;
