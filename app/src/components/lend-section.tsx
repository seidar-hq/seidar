"use client";

/* Lend tab (Markets > Blend / XOXNO > Lend), DeFi Saver Aave-v4 style:
   groups (Blend pools, XOXNO hubs) expand into lendable assets; picking one
   opens a Lend / Withdraw panel; "Your positions" lists what the account has
   lent. Lending is plain supply that is never collateral — Blend's Supply
   request, XOXNO's supply into an account Seidar never borrows from — so
   it earns the lend APY and cannot be liquidated. Everything runs from the
   smart account (the wallet signs). */

import { ModeSwitch } from "./position-overview";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getNetwork } from "@/lib/network";
import { signAndSend, toBase, type TxStep } from "@/lib/tx";
import { LoadingMark } from "./loading";
import { ProtoMark } from "./proto-mark";
import { useTxActive } from "./shell";
import { isSmartAddress, smartGate, useSmartAccount } from "./smart-gate";
import { TokenIcon } from "./token-icon";
import { TxModal, type TxSpec } from "./tx-modal";

type LendAsset = {
  asset: string;
  code: string;
  decimals: number;
  supplyApy: number | null;
  suppliedUsd: number | null;
  availableUsd: number | null;
  utilPct: number | null;
  spokeId?: number;
  frozen?: boolean;
};
type LendGroup = { protocol: "blend" | "xoxno"; id: string; name: string; hubId?: number; assets: LendAsset[]; tvlUsd: number; retired?: boolean };
type Leg = {
  protocol: "blend" | "xoxno";
  asset: string;
  code: string;
  pool?: string;
  suppliedUsd: number;
  borrowedUsd: number;
  supplyAmount?: number;
  borrowAmount?: number;
  lentAmount?: number;
  lentUsd?: number;
  xoxno?: { accountId: string; spokeId: number; hubId: number };
};
/** One lent balance: where it sits and how to withdraw it. */
type Lent = { group: LendGroup | null; groupId: string; asset: string; code: string; amount: number; usd: number; accountId?: string; spokeId?: number };

const STABLE = new Set(["USDC", "EURC", "PYUSD", "USDT0", "USDGLO", "OUSD", "USDY", "USTRY", "CETES", "EURX", "GBPX"]);
const fmtUsd = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(2)}K` : `$${v.toFixed(2)}`;
const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(2)}%`);
const trim = (n: number) => (n >= 1 ? n.toFixed(4) : n.toFixed(7)).replace(/\.?0+$/, "") || "0";
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
/** LP share tokens ("LP XLM/AQUA") use the pair's first token for the logo. */
const logoCode = (code: string) => (code.startsWith("LP ") ? code.slice(3).split("/")[0] : code);

export function LendSection({ id }: { id: "blend" | "xoxno" }) {
  const { owner, smarts } = useSmartAccount();
  const active = useTxActive(owner) ?? owner;
  const gate = !isSmartAddress(active) ? smartGate(owner, smarts) : null;
  const [groups, setGroups] = useState<LendGroup[] | null | "error">(null);
  const [groupBy, setGroupBy] = useState<"group" | "asset">("group");
  const [assetF, setAssetF] = useState<"all" | "stable" | "volatile">("all");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [pick, setPick] = useState<{ groupId: string; asset: string } | null>(null);
  const [mode, setMode] = useState<"lend" | "withdraw">("lend");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [spec, setSpec] = useState<TxSpec | null>(null);
  const [legs, setLegs] = useState<Leg[] | null>(null);
  const [bals, setBals] = useState<Record<string, number>>({});

  useEffect(() => {
    let dead = false;
    apiFetch("/api/lend/markets", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => !dead && setGroups(d?.ok ? ((d.groups ?? []) as LendGroup[]).filter((g) => g.protocol === id) : "error"))
      .catch(() => !dead && setGroups("error"));
    return () => {
      dead = true;
    };
  }, [id]);

  /* Market scope (?pool=<name>): the Lend tab of a market page lists only
     that pool / hub, already expanded. */
  const [scope, setScope] = useState<string | null>(null);
  useEffect(() => {
    try {
      setScope(new URLSearchParams(window.location.search).get("pool"));
    } catch {
      /* unscoped */
    }
  }, []);
  const all = useMemo(() => (Array.isArray(groups) ? groups : []), [groups]);
  const scopedList = useMemo(() => (scope ? all.filter((g) => g.name === scope) : []), [all, scope]);
  const scoped = scopedList.length > 0;
  const list = scoped ? scopedList : all;
  const allAssets = useMemo(() => [...new Set(list.flatMap((g) => g.assets.map((a) => a.asset)))], [list]);

  const loadMine = useCallback(() => {
    if (!active) {
      setLegs([]);
      setBals({});
      return;
    }
    apiFetch(`/api/positions?address=${active}&protocol=${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLegs(d?.ok ? ((d.legs ?? []) as Leg[]) : []))
      .catch(() => setLegs([]));
    const extra = active.startsWith("C") && allAssets.length ? `&tokens=${allAssets.join(",")}` : "";
    apiFetch(`/api/balances?address=${active}${extra}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const m: Record<string, number> = {};
        for (const b of (d?.balances ?? []) as { code: string; balance: number; contract?: string }[]) {
          m[b.code] = (m[b.code] ?? 0) + b.balance;
          if (b.contract) m[b.contract] = b.balance;
        }
        setBals(m);
      })
      .catch(() => setBals({}));
  }, [active, id, allAssets]);
  useEffect(() => {
    loadMine();
    window.addEventListener("seidar:refresh", loadMine);
    return () => window.removeEventListener("seidar:refresh", loadMine);
  }, [loadMine]);

  /* What the account has lent. Blend: the non-collateral supply part.
     XOXNO: supply in accounts that carry no debt at all. */
  const lent: Lent[] = useMemo(() => {
    const out: Lent[] = [];
    const byId = new Map(list.map((g) => [g.id, g]));
    if (id === "blend") {
      for (const l of legs ?? [])
        if ((l.lentAmount ?? 0) > 0.0000001 && l.pool)
          out.push({ group: byId.get(l.pool) ?? null, groupId: l.pool, asset: l.asset, code: l.code, amount: l.lentAmount!, usd: l.lentUsd ?? 0 });
    } else {
      const indebted = new Set((legs ?? []).filter((l) => (l.borrowAmount ?? 0) > 0 && l.xoxno).map((l) => l.xoxno!.accountId));
      for (const l of legs ?? []) {
        if (!l.xoxno || indebted.has(l.xoxno.accountId) || !((l.supplyAmount ?? 0) > 0)) continue;
        const gid = `xoxno-hub-${l.xoxno.hubId}`;
        out.push({ group: byId.get(gid) ?? null, groupId: gid, asset: l.asset, code: l.code, amount: l.supplyAmount!, usd: l.suppliedUsd, accountId: l.xoxno.accountId, spokeId: l.xoxno.spokeId });
      }
    }
    // A market page shows only what is lent in that market.
    return scoped ? out.filter((x) => byId.has(x.groupId)) : out;
  }, [legs, list, id, scoped]);

  const balOf = (a: LendAsset) => bals[a.asset] ?? bals[a.code] ?? 0;
  const keep = (a: LendAsset) =>
    (assetF === "all" || (assetF === "stable" ? STABLE.has(a.code) : !STABLE.has(a.code))) &&
    (!ownedOnly || balOf(a) > 0 || lent.some((x) => x.asset === a.asset));
  const shown = list.filter((g) => !g.retired).map((g) => ({ ...g, assets: g.assets.filter(keep) })).filter((g) => g.assets.length > 0);
  const assetCount = shown.reduce((t, g) => t + g.assets.length, 0);
  const groupWord = id === "xoxno" ? "hub" : "pool";
  /* Group by asset: one block per asset code listing each pool/hub. */
  const byAsset = useMemo(() => {
    const m = new Map<string, { code: string; rows: { g: LendGroup; a: LendAsset }[] }>();
    for (const g of shown) for (const a of g.assets) m.set(a.code, { code: a.code, rows: [...(m.get(a.code)?.rows ?? []), { g, a }] });
    return [...m.values()].sort((x, y) => y.rows.reduce((t, r) => t + (r.a.suppliedUsd ?? 0), 0) - x.rows.reduce((t, r) => t + (r.a.suppliedUsd ?? 0), 0));
  }, [shown]);

  const sel = pick ? list.find((g) => g.id === pick.groupId) : null;
  const selAsset = sel?.assets.find((a) => a.asset === pick?.asset) ?? null;
  const selLent = pick ? lent.filter((x) => x.groupId === pick.groupId && x.asset === pick.asset) : [];
  const lentAmt = selLent.reduce((t, x) => t + x.amount, 0);

  function choose(g: LendGroup, a: LendAsset, m: "lend" | "withdraw" = "lend") {
    setPick({ groupId: g.id, asset: a.asset });
    setMode(m);
    setAmount("");
    setErr(null);
  }

  /* XOXNO lend account: an account in the deposit spoke that never borrowed
     (reuse keeps one lend account per spoke), else a new one ("0"). */
  function xoxnoLendAccount(spokeId: number): string {
    const indebted = new Set((legs ?? []).filter((l) => (l.borrowAmount ?? 0) > 0 && l.xoxno).map((l) => l.xoxno!.accountId));
    const acct = (legs ?? []).find((l) => l.xoxno && l.xoxno.spokeId === spokeId && !indebted.has(l.xoxno.accountId));
    return acct?.xoxno?.accountId ?? "0";
  }

  function submit() {
    setErr(null);
    if (!sel || !selAsset || !active || !owner) return;
    const n = Number(amount);
    if (!(n > 0)) return setErr("Enter an amount above 0.");
    const bal = balOf(selAsset);
    if (mode === "lend" && n > bal) return setErr(`You have ${trim(bal)} ${selAsset.code} in this account.`);
    if (mode === "withdraw" && n > lentAmt * 1.000001) return setErr(`You have ${trim(lentAmt)} ${selAsset.code} lent here.`);
    if (mode === "lend" && selAsset.frozen) return setErr("This pool is frozen — it takes no new supply.");
    const base = toBase(amount, selAsset.decimals);
    if (!base) return setErr("Enter a valid amount.");
    const all = mode === "withdraw" && n >= lentAmt * 0.9999;
    const xo =
      id === "xoxno"
        ? mode === "lend"
          ? { spokeId: selAsset.spokeId!, hubId: sel.hubId!, accountId: xoxnoLendAccount(selAsset.spokeId!) }
          : { spokeId: selLent[0]?.spokeId, hubId: sel.hubId!, accountId: selLent[0]?.accountId }
        : undefined;
    const verb = mode === "lend" ? "Lend" : "Withdraw";
    setSpec({
      title: `${verb}: ${amount} ${selAsset.code}`,
      code: logoCode(selAsset.code),
      amount,
      context: `${id === "blend" ? "Blend" : "XOXNO"} · ${sel.name}`,
      rows: [
        { label: verb, value: `${amount} ${selAsset.code}` },
        { label: "Lend APY", value: pct(selAsset.supplyApy) },
        { label: "Collateral", value: "No", hint: "Lent assets back no loan, so they can't be liquidated." },
        ...(id === "xoxno" && mode === "lend"
          ? [{ label: "XOXNO account", value: xo?.accountId === "0" ? "New lending account" : `#${xo?.accountId}`, hint: "Seidar never borrows from it." }]
          : []),
        { label: "From", value: short(active), hint: "Your smart account" },
        { label: "Signatures", value: "1" },
      ],
      confirmLabel: verb,
      execute: async (onSteps) => {
        const step: TxStep = { key: "lend", label: `${verb} ${selAsset.code}`, status: "building" };
        onSteps([{ ...step }]);
        try {
          const b = await apiFetch("/api/lending/build", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              protocol: id,
              from: active,
              signer: owner,
              pool: id === "blend" ? sel.id : undefined,
              xoxno: xo,
              actions: [{ action: mode === "lend" ? "lend" : "unlend", asset: selAsset.asset, amount: all ? "max" : base }],
            }),
          }).then((r) => r.json());
          if (!b?.ok || typeof b.xdr !== "string") throw new Error(String(b?.error ?? "Could not build the transaction."));
          const sent = await signAndSend(b.xdr, owner, (st) => {
            step.status = st;
            onSteps([{ ...step }]);
          });
          step.status = "done";
          step.hash = sent.hash;
          onSteps([{ ...step }]);
          setAmount("");
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

  const assetRow = (g: LendGroup, a: LendAsset, label?: string) => {
    const on = pick?.groupId === g.id && pick.asset === a.asset;
    return (
      <button key={`${g.id}-${a.asset}`} type="button" className={`ls-arow${on ? " on" : ""}`} onClick={() => choose(g, a)}>
        <span className="ls-acode">
          <TokenIcon symbol={logoCode(a.code)} size={22} />
          <span>
            <b>{label ?? a.code}</b>
            {a.frozen && <small>Frozen</small>}
          </span>
        </span>
        <span className="ls-apy">{pct(a.supplyApy)}</span>
        <span>{fmtUsd(a.suppliedUsd)}</span>
        <span>{fmtUsd(a.availableUsd)}</span>
        <span>{a.utilPct != null ? `${a.utilPct.toFixed(1)}%` : "—"}</span>
      </button>
    );
  };
  const assetHead = (first: string) => (
    <div className="ls-arow ls-ahead" aria-hidden="true">
      <span>{first}</span>
      <span>Lend APY</span>
      <span>Supplied</span>
      <span>Available</span>
      <span>Utilisation</span>
    </div>
  );

  return (
    <div className="ls">
      <div className="ls-controls">
        <label className="ls-ctl">
          Group by:
          <select value={scoped ? "group" : groupBy} disabled={scoped} onChange={(e) => setGroupBy(e.target.value as "group" | "asset")} aria-label="Group by">
            <option value="group">{id === "xoxno" ? "Hub" : "Pool"}</option>
            <option value="asset">Asset</option>
          </select>
        </label>
        <label className="ls-ctl">
          Assets:
          <select value={assetF} onChange={(e) => setAssetF(e.target.value as typeof assetF)} aria-label="Asset filter">
            <option value="all">All</option>
            <option value="stable">Stable</option>
            <option value="volatile">Volatile</option>
          </select>
        </label>
        <span className="ls-count">
          Showing <b>{assetCount}</b> asset{assetCount === 1 ? "" : "s"}{" "}
          {scoped ? (
            <>
              in <b>{scope}</b>
            </>
          ) : (
            <>
              across <b>{shown.length}</b> {groupWord}
              {shown.length === 1 ? "" : "s"}
            </>
          )}{" "}
          on {getNetwork() === "testnet" ? "Testnet" : "Mainnet"}
        </span>
        <label className="ls-owned">
          <button type="button" role="switch" aria-checked={ownedOnly} className={`x-switch${ownedOnly ? " on" : ""}`} onClick={() => setOwnedOnly((v) => !v)}>
            <i aria-hidden="true" />
          </button>
          Owned assets only
        </label>
      </div>

      <div className="ls-grid">
        <div className="ls-list">
          {groups === null ? (
            <p className="pf-empty load-row">
              <LoadingMark size={14} /> Loading lend markets…
            </p>
          ) : groups === "error" ? (
            <p className="pf-empty">Lend markets unreachable — reload to retry.</p>
          ) : shown.length === 0 ? (
            <p className="pf-empty">{ownedOnly ? "You hold none of these assets yet." : "No assets match this filter."}</p>
          ) : groupBy === "group" || scoped ? (
            shown.map((g) => {
              const isOpen = open[g.id] ?? scoped;
              return (
                <div key={g.id} className="ls-group">
                  <button type="button" className="ls-ghead" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))}>
                    <span className={`mk-chev${isOpen ? " open" : ""}`} aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </span>
                    <span className="ls-gname">
                      <b>{g.name}</b>
                      <small>
                        {g.assets.length} asset{g.assets.length === 1 ? "" : "s"} · TVL: {fmtUsd(g.tvlUsd)}
                      </small>
                    </span>
                    <span className="ls-gassets">
                      <span className="mh-stack">
                        {g.assets.slice(0, 5).map((a) => (
                          <TokenIcon key={a.asset} symbol={logoCode(a.code)} size={22} />
                        ))}
                        {g.assets.length > 5 && <small>+{g.assets.length - 5}</small>}
                      </span>
                      <small>Assets</small>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="ls-assets">
                      {assetHead("Asset")}
                      {g.assets.map((a) => assetRow(g, a))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            byAsset.map((b) => {
              const isOpen = open[`a:${b.code}`] ?? false;
              return (
                <div key={b.code} className="ls-group">
                  <button type="button" className="ls-ghead" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [`a:${b.code}`]: !isOpen }))}>
                    <span className={`mk-chev${isOpen ? " open" : ""}`} aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </span>
                    <span className="ls-gname ls-gasset">
                      <TokenIcon symbol={logoCode(b.code)} size={26} />
                      <span>
                        <b>{b.code}</b>
                        <small>
                          {b.rows.length} {groupWord}
                          {b.rows.length === 1 ? "" : "s"} · best {pct(Math.max(...b.rows.map((r) => r.a.supplyApy ?? 0)))}
                        </small>
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="ls-assets">
                      {assetHead(id === "xoxno" ? "Hub" : "Pool")}
                      {b.rows.map((r) => assetRow(r.g, r.a, r.g.name))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <aside className="ls-panel">
          {!sel || !selAsset ? (
            <div className="ls-pick">
              <b>Select an asset</b>
              <p>Click a row in the asset list to lend or withdraw.</p>
            </div>
          ) : (
            <>
              <div className="ls-phead">
                <TokenIcon symbol={logoCode(selAsset.code)} size={34} />
                <span>
                  <b>{selAsset.code}</b>
                  <small>
                    <ProtoMark id={id} size={14} /> {sel.name}
                  </small>
                </span>
                <button type="button" className="mv-x" aria-label="Close" onClick={() => setPick(null)}>
                  ×
                </button>
              </div>
              <ModeSwitch
                label="Lend or withdraw"
                value={mode}
                options={[
                  ["lend", "Lend"],
                  ["withdraw", "Withdraw"],
                ]}
                onChange={(m) => {
                  setMode(m);
                  setAmount("");
                  setErr(null);
                }}
              />
              <div className="pd-box">
                <div className="pd-box-top">
                  <span className="pd-tok">
                    <TokenIcon symbol={logoCode(selAsset.code)} size={22} /> {selAsset.code}
                  </span>
                  <span className="pd-bal">
                    {trim(mode === "lend" ? balOf(selAsset) : lentAmt)} {selAsset.code}{" "}
                    <button
                      type="button"
                      className="pd-max"
                      disabled={!((mode === "lend" ? balOf(selAsset) : lentAmt) > 0)}
                      onClick={() => setAmount(trim(mode === "lend" ? balOf(selAsset) : lentAmt))}
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
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                />
              </div>
              <div className="pd-meta">
                <div>
                  <span>Lend APY</span>
                  <b className="ls-apy">{pct(selAsset.supplyApy)}</b>
                </div>
                <div>
                  <span>Available liquidity</span>
                  <b>{fmtUsd(selAsset.availableUsd)}</b>
                </div>
                <div>
                  <span>You have lent</span>
                  <b>
                    {trim(lentAmt)} {selAsset.code}
                  </b>
                </div>
                <div>
                  <span>Collateral</span>
                  <b>No — can&apos;t be liquidated</b>
                </div>
              </div>
              {err && <p className="qm-error">{err}</p>}
              <button type="button" className="btn primary pd-submit" onClick={gate ? gate.run : submit}>
                {gate ? gate.label : mode === "lend" ? "Lend" : "Withdraw"}
              </button>
            </>
          )}
        </aside>
      </div>

      <h2 className="ls-h">Your positions</h2>
      <div className="pf-card ls-mine">
        {!active ? (
          <div className="ls-empty">
            <b>Connect a wallet</b>
            <p>Your lent assets show here with their APY.</p>
          </div>
        ) : legs === null ? (
          <p className="pf-empty load-row">
            <LoadingMark size={14} /> Reading your positions…
          </p>
        ) : lent.length === 0 ? (
          <div className="ls-empty">
            <b>No lent assets yet</b>
            <p>Lend an asset from any {groupWord} above and it will appear here with its APY.</p>
          </div>
        ) : (
          <div className="proto-tablewrap">
            <div className="proto-thead ls-prow">
              <span>Asset</span>
              <span>{id === "xoxno" ? "Hub" : "Pool"}</span>
              <span>Lent</span>
              <span>Value</span>
              <span>APY</span>
              <span>Est. yearly</span>
              <span />
            </div>
            {lent.map((x) => {
              const a = x.group?.assets.find((y) => y.asset === x.asset) ?? null;
              return (
                <div key={`${x.groupId}-${x.asset}-${x.accountId ?? ""}`} className="proto-trow ls-prow">
                  <span className="pd-tok">
                    <TokenIcon symbol={logoCode(x.code)} size={22} /> {x.code}
                  </span>
                  <span>
                    {x.group?.name ?? short(x.groupId)}
                    {x.group?.retired ? " (retired)" : ""}
                  </span>
                  <span>{trim(x.amount)}</span>
                  <span>{fmtUsd(x.usd)}</span>
                  <span className="ls-apy">{pct(a?.supplyApy)}</span>
                  <span>{a?.supplyApy != null ? fmtUsd((x.usd * a.supplyApy) / 100) : "—"}</span>
                  <span className="mh-act">
                    <button
                      type="button"
                      className="btn mk-create"
                      disabled={!x.group || !a}
                      title={!x.group || !a ? "This market is no longer in the feed." : undefined}
                      onClick={() => x.group && a && choose(x.group, a, "withdraw")}
                    >
                      Withdraw
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <TxModal spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}
