"use client";
import { useRouter } from "next/navigation";
import { ProtoMark } from "./proto-mark";
import { TokenIcon } from "./token-icon";

/* Seidar Strategy landing — name, description, and the entry point to
 * the fullscreen strategy canvas. The canvas lives at /strategies/create
 * (no sidebar/navbar); strategies compile to real @seidar/sdk recipes
 * over live Stellar vaults and RWA assets only. */

export function StrategyBuilder() {
  const router = useRouter();
  return (
    <div className="strat-wrap">
      <div className="pf-card strat-hero">
        <h1 className="strat-hero-title">Strategy</h1>
        <p className="strat-hero-desc">
          Compose vault deposits and RWA allocations into one atomic Soroban
          execution — quoted, validated and signed in your wallet.
        </p>
      </div>
      <div className="pf-card strat-body">
        <div className="strat-preview" aria-hidden="true">
          <span className="sp-node">
            <TokenIcon symbol="USDC" size={16} />
            <b>USDC</b>
            <small>Deposit</small>
          </span>
          <i className="sp-wire" />
          <span className="sp-node">
            <ProtoMark id="defindex" size={16} />
            <b>Vault</b>
            <small>Earn</small>
          </span>
          <i className="sp-wire" />
          <span className="sp-node">
            <TokenIcon symbol="CETES" size={16} />
            <b>CETES</b>
            <small>RWA</small>
          </span>
        </div>
        <div className="strat-body-copy">
          <h2>Build on the canvas</h2>
          <p>
            Drag live vaults and RWA assets onto the canvas, connect outputs
            to inputs and set the allocations — Seidar quotes every leg and
            compiles the graph into one atomic execution signed in your
            wallet.
          </p>
          <button
            type="button"
            className="btn primary strat-hero-cta"
            onClick={() => router.push("/strategies/create")}
          >
            Create your strategy
          </button>
        </div>
      </div>
    </div>
  );
}
