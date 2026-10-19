"use client";
import { useRouter } from "next/navigation";

/* Seidar Strategy landing — name, description, and the entry point to
 * the fullscreen strategy canvas. The canvas lives at /strategies/create
 * (no sidebar/navbar); strategies compile to real @seidar/sdk recipes
 * over live Stellar markets only. */

export function StrategyBuilder() {
  const router = useRouter();
  return (
    <div className="pf-card strat-hero">
      <h1 className="strat-hero-title">Strategy</h1>
      <p className="strat-hero-desc">
        Compose flash loans, lending legs, swaps and earn deposits into one
        atomic Soroban execution — quoted, validated and signed in your
        wallet.
      </p>
      <button
        type="button"
        className="btn primary strat-hero-cta"
        onClick={() => router.push("/strategies/create")}
      >
        {" "}
        Create your strategy{" "}
      </button>
    </div>
  );
}
