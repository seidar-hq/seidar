"use client";

/* Vault page (DeFindex / Upshift): Manage = header + live stats, your
   deposit, vault attributes (strategies, fees, curator) and a deposit /
   withdraw panel run from the smart account; History = the account's own
   transactions with this vault. Every number is live from the API. */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { accountLabel } from "@/lib/account-names";
import { explorerBase } from "@/lib/network";
import { signAndSend, toBase, type TxStep } from "@/lib/tx";
import { LoadingMark } from "./loading";
import { ProtocolHistory } from "./protocol-history";
import { ProtoMark } from "./proto-mark";
import { useTxActive } from "./shell";
import { isSmartAddress, smartGate, useSmartAccount } from "./smart-gate";
import { TokenIcon } from "./token-icon";
import { TxModal, type TxSpec } from "./tx-modal";
import { ModeSwitch, PositionOverview } from "./position-overview";
import { VenueTopbar, type VenueSection } from "./views";

type Detail = {
  protocol: string;
  address: string;
  name: string;
  symbol?: string;
  assets: { address: string; code: string; strategies: { address: string; name: string; paused: boolean }[] }[];
  feesBps?: { vaultFee?: number; defindexFee?: number; performanceFee?: number };
  sharePrice?: number | null;
  tvlUsd?: number | null;
  apyPct?: number | null;
  ownApy7d?: number | null;
  ownApy30d?: number | null;
  depositors?: number | null;
  manager?: string | null;
  curator?: string;
  withdrawalDays?: number;
  rewardApr?: number | null;
  appUrl?: string;
};
type Row = { address: string; assetCode: string; assetDecimals: number; asset: string; apyPct: number | null; tvlUsd: number | null };
type Pos = { vault: string; shares: string; underlying?: { amount: string }[]; valueUsd: number | null };

const fmtUsd = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : v >= 1e6
      ? `$${(v / 1e6).toFixed(2)}M`
      : v >= 1e3
        ? `$${(v / 1e3).toFixed(2)}K`
        : `$${v.toFixed(2)}`;
const pctS = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(2)}%`);
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const trim = (n: number) => (n >= 1 ? n.toFixed(4) : n.toFixed(7)).replace(/\.?0+$/, "") || "0";
/** Share counts: vault share tokens have their own decimals, so they are
 *  derived from the deposit and the share price instead of raw units. */
const fmtNumShort = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 2 : 4 });
const venueLabel = (p: string) => (p === "upshift" ? "Upshift" : "DeFindex");
const stratLabel = (s: string) =>
  s
    .split("_")
    .map((w) => (w === "usdc" || w === "eurc" || w === "xlm" ? w.toUpperCase() : w[0]?.toUpperCase() + w.slice(1)))
    .join(" ");

async function postJson(path: string, body: unknown) {
  const r = await apiFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}

export function VaultDetail({ protocol, address, section = "manage" }: { protocol: string; address: string; section?: VenueSection }) {
  const { owner, smarts } = useSmartAccount();
  const active = useTxActive(owner) ?? owner;
  const gate = !isSmartAddress(active) ? smartGate(owner, smarts) : null;
  const [detail, setDetail] = useState<Detail | null | "error">(null);
  const [row, setRow] = useState<Row | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  /** The position read for the current account has answered (or failed). */
  const [posReady, setPosReady] = useState(false);
  const [bal, setBal] = useState<number | null>(null);
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [max, setMax] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [spec, setSpec] = useState<TxSpec | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setDetail(null);
    // A vault read can fail on an RPC hiccup: retry a few times before
    // showing the error.
    const load = (tries: number) =>
      apiFetch(`/api/vaults/detail?protocol=${protocol}&address=${address}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (dead) return;
          if (d?.ok) return setDetail(d.detail as Detail);
          throw new Error("vault read failed");
        })
        .catch(() => {
          if (dead) return;
          if (tries > 0) timer = setTimeout(() => load(tries - 1), 2000);
          else setDetail("error");
        });
    load(3);
    apiFetch("/api/vaults", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => !dead && setRow(((d?.rows ?? []) as Row[]).find((x) => x.address === address) ?? null))
      .catch(() => {});
    return () => {
      dead = true;
      if (timer) clearTimeout(timer);
    };
  }, [protocol, address, reloadKey]);

  const decimals = row?.assetDecimals ?? 7;
  const code = row?.assetCode ?? (detail && detail !== "error" ? detail.assets[0]?.code : "") ?? "";
  const loadMine = useCallback(() => {
    if (!active) {
      setPos(null);
      setBal(null);
      setPosReady(true);
      return;
    }
    apiFetch(`/api/vaults/positions?address=${active}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPos(((d?.positions ?? []) as Pos[]).find((p) => p.vault === address) ?? null))
      .catch(() => setPos(null))
      .finally(() => setPosReady(true));
    apiFetch(`/api/balances?address=${active}${row?.asset ? `&tokens=${row.asset}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const b = ((d?.balances ?? []) as { code: string; balance: number }[]).find((x) => x.code === code);
        setBal(b ? b.balance : 0);
      })
      .catch(() => setBal(null));
  }, [active, address, row?.asset, code]);
  useEffect(() => setPosReady(false), [active, address]);
  useEffect(() => {
    loadMine();
    window.addEventListener("seidar:refresh", loadMine);
    return () => window.removeEventListener("seidar:refresh", loadMine);
  }, [loadMine]);

  const deposited = pos?.underlying?.[0] ? Number(pos.underlying[0].amount) / 10 ** decimals : 0;

  function submit() {
    setErr(null);
    if (!active || !owner) return setErr("Connect a wallet to continue.");
    const n = Number(amount);
    if (!(n > 0)) return setErr("Enter an amount above 0.");
    if (mode === "deposit" && bal != null && n > bal) return setErr(`You have ${trim(bal)} ${code} in this account.`);
    if (mode === "withdraw" && n > deposited * 1.000001) return setErr(`You have ${trim(deposited)} ${code} in this vault.`);
    const base = toBase(amount, decimals);
    if (!base) return setErr("Enter a valid amount.");
    const all = mode === "withdraw" && (max || n >= deposited * 0.9999) && pos;
    const verb = mode === "deposit" ? "Deposit" : "Withdraw";
    const d = detail && detail !== "error" ? detail : null;
    setSpec({
      title: `${verb}: ${amount} ${code}`,
      code,
      amount,
      context: `${d?.name ?? "Vault"} · ${venueLabel(protocol)}`,
      rows: [
        { label: verb, value: `${amount} ${code}` },
        { label: "Vault APY", value: pctS(row?.apyPct ?? d?.apyPct) },
        { label: "From", value: accountLabel(active), hint: "Your smart account" },
        ...(mode === "withdraw" && d?.withdrawalDays ? [{ label: "Withdrawal window", value: `${d.withdrawalDays} days`, hint: "Set by the vault curator" }] : []),
        { label: "Slippage guard", value: "0.5%" },
        { label: "Signatures", value: "1" },
      ],
      confirmLabel: verb,
      execute: async (onSteps) => {
        const step: TxStep = { key: "v", label: `${verb} ${code}`, status: "building" };
        onSteps([{ ...step }]);
        try {
          const b = await postJson("/api/vaults/build", {
            protocol,
            vault: address,
            action: mode === "deposit" ? "deposit" : all ? "withdraw-shares" : "withdraw",
            caller: active,
            signer: owner,
            amounts: [base],
            shares: all ? pos!.shares : undefined,
            slippageBps: 50,
          });
          if (!b?.ok || typeof b.xdr !== "string") throw new Error(String(b?.error ?? "Could not build the transaction."));
          const sent = await signAndSend(b.xdr, owner, (st) => {
            step.status = st;
            onSteps([{ ...step }]);
          });
          step.status = "done";
          step.hash = sent.hash;
          onSteps([{ ...step }]);
          setAmount("");
          setMax(false);
          window.dispatchEvent(new Event("seidar:refresh"));
        } catch (e) {
          step.status = "failed";
          step.error = e instanceof Error ? e.message : String(e);
          step.hash = (e as { hash?: string | null })?.hash ?? null;
          onSteps([{ ...step }]);
          throw e;
        }
      },
    });
  }

  const d = detail && detail !== "error" ? detail : null;
  const apy = d?.apyPct ?? row?.apyPct ?? null;
  const tvl = d?.tvlUsd ?? row?.tvlUsd ?? null;
  const has = deposited > 0;
  // USD: the API's own valuation, else the vault TVL per share price.
  const valueUsd = has ? (pos?.valueUsd ?? null) : 0;
  const sharePct = has && valueUsd != null && tvl ? (valueUsd / tvl) * 100 : null;
  return (
    <div className="ev-wrap">
      <VenueTopbar
        back={{ href: "/vaults", label: "Vaults" }}
        base={`/markets/${protocol}/vault/${address}`}
        section={section}
        sections={["manage", "history"]}
        hero={{
          logo: <TokenIcon symbol={code} size={52} />,
          title: d ? d.name : detail === "error" ? "Vault" : "Loading vault…",
          facts: d
            ? [
                { text: `${pctS(d.apyPct ?? row?.apyPct)} APY`, strong: true },
                { icon: <ProtoMark id={protocol} size={18} />, text: `${venueLabel(protocol)} vault` },
                { text: `TVL ${fmtUsd(d.tvlUsd ?? row?.tvlUsd)}` },
                { icon: <TokenIcon symbol={code} size={18} />, text: code },
                ...(d.curator ? [{ text: `Curated by ${d.curator}` }] : []),
                { text: <span title={address}>{short(address)}</span> },
              ]
            : [],
        }}
      />
      {detail === null ? (
        <p className="pf-empty load-row">
          <LoadingMark /> Loading live vault…
        </p>
      ) : detail === "error" ? (
        <div className="pf-card dx-center">
          <p>Couldn&apos;t read this vault from the network right now.</p>
          <button type="button" className="btn" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {section === "history" ? (
            <ProtocolHistory protocol={protocol} address={active ?? null} owner={owner ?? null} contract={address} />
          ) : (
            <div className="pd-layout">
              <div className="pd-col">
              <PositionOverview
                account={active ?? null}
                loading={!posReady}
                legs={[{ code, amount: deposited, usd: valueUsd }]}
                valueUsd={valueUsd}
                emptyHint={`Nothing in this vault yet. Deposit ${code} on the right.`}
                stats={[
                  {
                    label: "Vault share",
                    value: sharePct != null ? `${sharePct < 0.0001 ? "<0.0001" : sharePct.toFixed(4)}%` : has ? "—" : "0%",
                    sub: tvl != null ? `of ${fmtUsd(tvl)}` : undefined,
                  },
                  { label: "APY", value: pctS(apy), sub: d?.rewardApr ? `incl. ${pctS(d.rewardApr)} rewards` : "variable", tone: apy != null ? "green" : undefined },
                  { label: "Est. yearly", value: apy != null && valueUsd != null ? fmtUsd((valueUsd * apy) / 100) : "—", sub: "at today's APY" },
                  { label: "Shares", value: has ? (d?.sharePrice ? fmtNumShort(deposited / d.sharePrice) : "—") : "0", sub: d?.sharePrice != null ? `${d.sharePrice.toFixed(4)} ${code} each` : undefined },
                ]}
              />
              <div className="pd-main pd-card">
                <div className="pd-stats">
                  <div>
                    <span>TVL</span>
                    <b>{fmtUsd(d!.tvlUsd ?? row?.tvlUsd)}</b>
                    <small>{d!.depositors != null ? `${d!.depositors.toLocaleString()} depositors` : code}</small>
                  </div>
                  <div>
                    <span>APY</span>
                    <b className="pd-apy">{pctS(d!.apyPct ?? row?.apyPct)}</b>
                    <small>
                      {d!.ownApy7d != null || d!.ownApy30d != null
                        ? `Realised 7d ${pctS(d!.ownApy7d)} · 30d ${pctS(d!.ownApy30d)}`
                        : d!.rewardApr != null
                          ? `Includes ${pctS(d!.rewardApr)} rewards`
                          : "Advertised by the vault"}
                    </small>
                  </div>
                  <div>
                    <span>Asset</span>
                    <b className="pd-issuer">
                      <TokenIcon symbol={code} size={22} /> {code}
                    </b>
                  </div>
                  <div>
                    <span>Share price</span>
                    <b>{d!.sharePrice != null ? d!.sharePrice.toFixed(4) : "—"}</b>
                    <small>{code} per share</small>
                  </div>
                </div>
                <h3 className="pd-sec">Vault details</h3>
                <div className="pd-attrs">
                  <div>
                    <span>Venue</span>
                    <b className="pd-tok">
                      <ProtoMark id={protocol} size={18} /> {venueLabel(protocol)}
                    </b>
                  </div>
                  {d!.curator && (
                    <div>
                      <span>Curator</span>
                      <b>{d!.curator}</b>
                    </div>
                  )}
                  {d!.manager && (
                    <div>
                      <span>Manager</span>
                      <b title={d!.manager}>{short(d!.manager)}</b>
                    </div>
                  )}
                  <div>
                    <span>Fees</span>
                    <b>
                      {[
                        d!.feesBps?.vaultFee ? `Vault ${(d!.feesBps.vaultFee / 100).toFixed(1)}%` : null,
                        d!.feesBps?.performanceFee ? `Performance ${(d!.feesBps.performanceFee / 100).toFixed(1)}%` : null,
                        d!.feesBps?.defindexFee ? `Protocol ${(d!.feesBps.defindexFee / 100).toFixed(1)}%` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "None"}
                    </b>
                  </div>
                  {d!.withdrawalDays != null && (
                    <div>
                      <span>Withdrawal window</span>
                      <b>{d!.withdrawalDays} days</b>
                    </div>
                  )}
                  <div>
                    <span>Contract</span>
                    <b>
                      <a href={`${explorerBase()}/contract/${address}`} target="_blank" rel="noreferrer">
                        {short(address)} ↗
                      </a>
                    </b>
                  </div>
                </div>
                {d!.assets.some((a) => a.strategies.length > 0) && (
                  <>
                    <h3 className="pd-sec">Strategies</h3>
                    <div className="vd-strats">
                      {d!.assets.flatMap((a) =>
                        a.strategies.map((s) => (
                          <div key={s.address} className="vd-strat">
                            <TokenIcon symbol={a.code} size={18} />
                            <span>
                              <b>{stratLabel(s.name)}</b>
                              <small title={s.address}>{short(s.address)}</small>
                            </span>
                            <em className={`pill${s.paused ? "" : " green"}`}>{s.paused ? "Paused" : "Active"}</em>
                          </div>
                        )),
                      )}
                    </div>
                  </>
                )}
              </div>
              </div>
              <aside className="pd-side" aria-label="Vault deposit">
                <ModeSwitch
                  label="Deposit or withdraw"
                  value={mode}
                  options={[
                    ["deposit", "Deposit"],
                    ["withdraw", "Withdraw"],
                  ]}
                  onChange={(m) => {
                    setMode(m);
                    setAmount("");
                    setMax(false);
                    setErr(null);
                  }}
                />
                <div className="pd-box">
                  <div className="pd-box-top">
                    <span className="pd-tok">
                      <TokenIcon symbol={code} size={22} /> {code}
                    </span>
                    <span className="pd-bal">
                      {mode === "deposit" ? (bal != null ? trim(bal) : "—") : trim(deposited)} {code}{" "}
                      <button
                        type="button"
                        className="pd-max"
                        disabled={mode === "deposit" ? !(bal != null && bal > 0) : !(deposited > 0)}
                        onClick={() => {
                          const v = mode === "deposit" ? bal ?? 0 : deposited;
                          setAmount(v > 0 ? trim(v) : "");
                          setMax(mode === "withdraw");
                        }}
                      >
                        MAX
                      </button>
                    </span>
                  </div>
                  <input
                    className="pd-amt"
                    value={amount}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`${mode} amount`}
                    onChange={(e) => {
                      setAmount(e.target.value.replace(/[^0-9.]/g, ""));
                      setMax(false);
                    }}
                  />
                </div>
                <div className="pd-meta">
                  <div>
                    <span>Deposited</span>
                    <b>
                      {trim(deposited)} {code}
                    </b>
                  </div>
                  <div>
                    <span>APY</span>
                    <b>{pctS(d!.apyPct ?? row?.apyPct)}</b>
                  </div>
                </div>
                {err && <p className="qm-error">{err}</p>}
                <button type="button" className="btn primary pd-submit" onClick={gate ? gate.run : submit}>
                  {gate ? gate.label : mode === "deposit" ? "Deposit" : "Withdraw"}
                </button>
              </aside>
            </div>
          )}
        </>
      )}
      <TxModal spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}
