"use client";
import { useRouter } from "next/navigation";

/* Seidar Strategy landing — name, description, and the entry point to
 * the fullscreen strategy canvas. The canvas lives at /strategies/create
 * (no sidebar/navbar); strategies compile to real @seidar/sdk recipes
 * over live Stellar markets only. */

export function StrategyBuilder() {
  const router = useRouter();
  return (
    <>
      <div className="pf-head">
        <span className="pf-title">Strategy</span>
      </div>
      <p style={{ color: "#8a8a91", fontSize: 13, marginTop: 4 }}>
        Compose flash loans, lending legs, swaps and earn deposits into one
        atomic Soroban execution — quoted, validated and signed in your
        wallet.
      </p>
      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          className="btn primary"
          onClick={() => router.push("/strategies/create")}
        >
          {" "}
          Create your strategy{" "}
        </button>
      </div>
    </>
  );
}
