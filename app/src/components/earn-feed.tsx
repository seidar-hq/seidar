"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TokenIcon } from "./token-icon";
import { LeverageModal } from "./leverage";
import { EvMultiSelect, EvSelect } from "./earn";

/* Earn → Opportunities — a live opportunity feed across every Stellar
   venue Seidar reads. Nothing here is curated by hand: each card is computed from the
   live market feeds (/pools, /vaults, /dex/pools), and every button opens a
   flow that executes on-chain.

   Lanes (in-page; /earn?lane=<slug> deep-links one):
     Leverage     long / short on lending markets (Blend, XOXNO)
     Earn         vaults + lending supply (deposit and earn)
     Yield loops  borrow against yield-bearing / stable collateral where the
                  supply rate beats the borrow rate (net APY shown honestly)
     Liquidity    DEX pools (Aqua, Phoenix, Soroswap, Sushi V3) by TVL */

type Lane = "all" | "leverage" | "earn" | "loops" | "liquidity";
type Risk = "Low" | "Medium" | "High";

const LANES: { id: Lane; label: string; slug: string; blurb: string }[] = [
  { id: "all", label: "All", slug: "all", blurb: "Every live opportunity across Stellar DeFi." },
  { id: "leverage", label: "Leverage", slug: "leveraged-borrowing", blurb: "Go long or short with low to medium leverage on lending markets." },
  { id: "earn", label: "Vaults & lending", slug: "earn", blurb: "Deposit and earn — vaults and lending supply, no loan to manage." },
  { id: "loops", label: "Yield loops", slug: "yield-farming", blurb: "Borrow against yield-bearing collateral where supply beats borrow." },
  { id: "liquidity", label: "Liquidity", slug: "liquidity", blurb: "The deepest DEX pools on Stellar, by live on-chain TVL." },
];
const SLUG_TO_LANE: Record<string, Lane> = {
  all: "all",
  "leveraged-borrowing": "leverage",
  earn: "earn",
  "passive-yield": "earn",
  "yield-farming": "loops",
  liquidity: "liquidity",
};

/* Depth rules: a rate only means something if the market can absorb a
   deposit. A $181 pool at 12% falls to a fraction of that the moment
   anyone supplies, so it is not an opportunity. */
const MIN_LEND_USD = 50_000; // lending supply / loops listed from here
const MIN_VAULT_USD = 10_000; // vaults listed from here
const THIN_USD = 250_000; // below this: "Thin market", never Low risk
const HEADLINE_USD = 1_000_000; // header "best yield" only counts these
const PROBE_USD = 10_000; // dilution shown for a deposit this size

const STABLES = new Set(["USDC", "EURC", "PYUSD", "USDT0", "USDGLO", "USDX", "EURX"]);
const YIELD_BEARING = new Set(["CETES", "USTRY", "USDY", "TESOURO", "USST", "DEJTRSY"]);

const PROTO: Record<string, { label: string; logo: string; color: string }> = {
  blend: { label: "Blend", logo: "/protocol-blend.png", color: "#57c36b" },
  xoxno: { label: "XOXNO", logo: "/protocol-xoxno.png", color: "#a2f0d6" },
  defindex: { label: "DeFindex", logo: "/defindex-mark.svg", color: "#57c36b" },
  upshift: { label: "Upshift", logo: "/upshift-logo.png", color: "#5b8cff" },
  aqua: { label: "Aqua", logo: "/aqua-logo.png", color: "#b175ff" },
  phoenix: { label: "Phoenix", logo: "/dex-phoenix.png", color: "#ff8a3d" },
  soroswap: { label: "Soroswap", logo: "/dex-soroswap.png", color: "#8866ff" },
  sushi: { label: "Sushi", logo: "/sushi-logo.png", color: "#f070a8" },
};

type PoolRow = {
  collateral: string;
  debt: string | null;
  supplyApy: number | null;
  borrowApy: number | null;
  maxLev: string;
  ltv: number | null;
  marketSizeUsd: number | null;
  withdrawableUsd: number | null;
  protocol: "blend" | "xoxno";
  pool: string;
  poolName: string;
  poolStatus?: number | null;
  available?: boolean;
  borrowPaused?: boolean;
  apyUnknown?: boolean;
};
type VaultRow = {
  protocol: "defindex" | "upshift";
  address: string;
  name: string;
  assetCode: string;
  tvlUsd: number;
  apyPct: number | null;
  curator?: string;
};
type DexRow = {
  protocol: "aqua" | "phoenix" | "soroswap" | "sushi";
  address: string;
  pair: string;
  assets: { code: string }[];
  feeBps: number | null;
  tvlUsd: number | null;
  poolType: string | null;
  apyPct?: number | null;
  volume24hUsd?: number | null;
};

type Opp = {
  id: string;
  lane: Exclude<Lane, "all">;
  protocol: string;
  venue: string;
  assets: string[];
  title: string;
  metric: { label: string; value: string };
  facts: { label: string; value: string }[];
  risk: Risk;
  /** Market too shallow for its rate to hold under a real deposit. */
  thin?: string;
  /** Sort keys */
  apy: number;
  tvl: number;
  lev: number;
  cta: { label: string; go: () => void };
  alt?: { label: string; go: () => void };
};

const pct = (v: number) => `${v.toFixed(v >= 10 ? 1 : 2)}%`;
const usd = (v: number) =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${Math.round(v)}`;
const levNum = (s: string) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;

function laneFromUrl(): Lane {
  try {
    return SLUG_TO_LANE[new URLSearchParams(window.location.search).get("lane") ?? "all"] ?? "all";
  } catch {
    return "all";
  }
}

/** Switch the Earn page's opportunity feed to a lane (by slug) and scroll to it. */
export function showOpportunities(slug: string) {
  window.dispatchEvent(new CustomEvent("seidar:earn-lane", { detail: slug }));
  document.getElementById("opportunities")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function EarnFeed() {
  const router = useRouter();
  const [lane, setLane] = useState<Lane>("all");
  useEffect(() => {
    setLane(laneFromUrl());
    function onLane(e: Event) {
      const l = SLUG_TO_LANE[String((e as CustomEvent<string>).detail)];
      if (l) setLane(l);
    }
    window.addEventListener("seidar:earn-lane", onLane);
    return () => window.removeEventListener("seidar:earn-lane", onLane);
  }, []);
  const [pools, setPools] = useState<PoolRow[] | null>(null);
  const [vaults, setVaults] = useState<VaultRow[] | null>(null);
  const [dex, setDex] = useState<DexRow[] | null>(null);
  // Asset filter: empty = all assets.
  const [assets, setAssets] = useState<string[]>([]);
  const [risk, setRisk] = useState<Risk | "Any">("Any");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"apy" | "tvl" | "lev">("apy");
  const [leverage, setLeverage] = useState<null | { asset: string; direction: "long" | "short" }>(null);
  // ?asset=USTRY preselects a chip (home cards deep-link here).
  useEffect(() => {
    try {
      const a = new URLSearchParams(window.location.search).get("asset");
      if (a && /^[A-Z0-9]{2,12}$/.test(a)) setAssets([a]);
    } catch {
      /* no filter */
    }
  }, []);

  useEffect(() => {
    let dead = false;
    apiFetch("/api/pools", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => !dead && setPools(d?.ok ? d.rows : []))
      .catch(() => !dead && setPools([]));
    apiFetch("/api/vaults", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => !dead && setVaults(d?.ok ? d.rows : []))
      .catch(() => !dead && setVaults([]));
    Promise.all(
      (["aqua", "phoenix", "soroswap", "sushi"] as const).map((p) =>
        apiFetch(`/api/dex/pools?protocol=${p}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => (d?.rows ?? []) as DexRow[])
          .catch(() => [] as DexRow[]),
      ),
    ).then((all) => !dead && setDex(all.flat()));
    return () => {
      dead = true;
    };
  }, []);

  /* Deep links into the executing flows. */
  const openVault = (v: VaultRow) => {
    try {
      window.localStorage.setItem("seidar.openVault", JSON.stringify({ protocol: v.protocol, address: v.address, mode: "deposit" }));
    } catch {
      /* modal opens from the list instead */
    }
    router.push(`/markets/${v.protocol}`);
  };
  const openMarket = (protocol: string, collateral: string, debt: string | null, section: "lend" | "create") => {
    try {
      window.localStorage.setItem("seidar.prefillMarket", JSON.stringify({ collateral, debt }));
    } catch {
      /* board defaults */
    }
    router.push(`/markets/${protocol}/${section}`);
  };

  const opps: Opp[] = useMemo(() => {
    const out: Opp[] = [];
    const live = (pools ?? []).filter((p) => p.available !== false);
    // ----- Leverage: best market per (protocol, collateral, direction).
    const levBest = new Map<string, PoolRow>();
    for (const p of live) {
      if (!p.debt || p.borrowPaused || (p.poolStatus ?? 0) >= 2 || !(levNum(p.maxLev) > 1)) continue;
      const long = !STABLES.has(p.collateral) && STABLES.has(p.debt);
      const short = STABLES.has(p.collateral) && !STABLES.has(p.debt);
      if (!long && !short) continue;
      const key = `${p.protocol}:${long ? "L" : "S"}:${long ? p.collateral : p.debt}`;
      const cur = levBest.get(key);
      const score = (r: PoolRow) => levNum(r.maxLev) * 100 - (r.borrowApy ?? 99);
      if (!cur || score(p) > score(cur)) levBest.set(key, p);
    }
    for (const [key, p] of levBest) {
      const long = key.split(":")[1] === "L";
      const base = long ? p.collateral : p.debt!;
      const lv = levNum(p.maxLev);
      out.push({
        id: `lev-${key}`,
        lane: "leverage",
        protocol: p.protocol,
        venue: p.poolName,
        assets: long ? [p.collateral, p.debt!] : [p.debt!, p.collateral],
        title: `${long ? "Long" : "Short"} ${base} up to ${lv.toFixed(1)}x`,
        metric: { label: `Borrow ${p.debt}`, value: p.borrowApy != null ? pct(p.borrowApy) : "—" },
        facts: [
          { label: "Collateral", value: p.collateral },
          { label: "Max LTV", value: p.ltv != null ? `${Math.round(p.ltv * 100)}%` : "—" },
          { label: "Borrowable", value: p.withdrawableUsd != null ? usd(p.withdrawableUsd) : "—" },
        ],
        risk: lv >= 3 ? "High" : "Medium",
        apy: -(p.borrowApy ?? 0),
        tvl: p.marketSizeUsd ?? 0,
        lev: lv,
        cta:
          p.protocol === "blend"
            ? { label: long ? "Long" : "Short", go: () => setLeverage({ asset: base, direction: long ? "long" : "short" }) }
            : { label: "Open position", go: () => openMarket(p.protocol, p.collateral, p.debt, "create") },
        alt: { label: "Markets", go: () => router.push(`/markets/${p.protocol}`) },
      });
    }
    // ----- Earn: vaults (no test/dust) + lending supply.
    for (const v of vaults ?? []) {
      if (v.apyPct == null || !(v.apyPct > 0) || v.tvlUsd < MIN_VAULT_USD) continue;
      const stable = STABLES.has(v.assetCode) || YIELD_BEARING.has(v.assetCode);
      const thin = v.tvlUsd < THIN_USD;
      out.push({
        id: `vault-${v.address}`,
        lane: "earn",
        protocol: v.protocol,
        venue: v.name,
        assets: [v.assetCode],
        title: `Earn on ${v.assetCode}`,
        metric: { label: "APY", value: pct(v.apyPct) },
        facts: [
          { label: "Vault", value: v.name },
          { label: "TVL", value: usd(v.tvlUsd) },
          { label: "Type", value: v.protocol === "upshift" ? "Curated vault" : "Strategy vault" },
        ],
        risk: stable && !thin ? "Low" : thin && !stable ? "High" : "Medium",
        thin: thin ? `Small vault (${usd(v.tvlUsd)}): its APY can swing as money moves.` : undefined,
        apy: v.apyPct,
        tvl: v.tvlUsd,
        lev: 1,
        cta: { label: "Deposit", go: () => openVault(v) },
      });
    }
    const supplyBest = new Map<string, PoolRow>();
    for (const p of live) {
      // On-ice / frozen pools take no new borrows, so their supply rate only decays.
      if (p.debt || p.apyUnknown || (p.poolStatus ?? 0) >= 2 || !((p.supplyApy ?? 0) > 0.25)) continue;
      if ((p.marketSizeUsd ?? 0) < MIN_LEND_USD) continue;
      const key = `${p.protocol}:${p.pool}:${p.collateral}`;
      if (!supplyBest.has(key)) supplyBest.set(key, p);
    }
    for (const [key, p] of supplyBest) {
      const size = p.marketSizeUsd ?? 0;
      const thin = size < THIN_USD;
      // Supply APY ~ borrow interest / supplied: a deposit dilutes it at least
      // pro rata (the borrow rate also falls with utilization).
      const after = ((p.supplyApy ?? 0) * size) / (size + PROBE_USD);
      out.push({
        id: `sup-${key}`,
        lane: "earn",
        protocol: p.protocol,
        venue: p.poolName,
        assets: [p.collateral],
        title: `Lend ${p.collateral}`,
        metric: { label: "Supply APY", value: pct(p.supplyApy ?? 0) },
        facts: [
          { label: "Market", value: p.poolName },
          { label: "Pool size", value: p.marketSizeUsd != null ? usd(p.marketSizeUsd) : "—" },
          { label: "Withdrawable", value: p.withdrawableUsd != null ? usd(p.withdrawableUsd) : "—" },
        ],
        risk: STABLES.has(p.collateral) && !thin ? "Low" : thin && !STABLES.has(p.collateral) ? "High" : "Medium",
        thin: thin ? `Thin market (${usd(size)}): a ${usd(PROBE_USD)} deposit drops it to ~${pct(after)}.` : undefined,
        apy: p.supplyApy ?? 0,
        tvl: p.marketSizeUsd ?? 0,
        lev: 1,
        cta: { label: "Supply", go: () => openMarket(p.protocol, p.collateral, null, "lend") },
      });
    }
    // ----- Yield loops: collateral yield beats borrow cost, no FX/price
    // mismatch (stable vs stable of the same peg, or yield-bearing vs USD).
    const supplyApy = new Map<string, number>();
    for (const p of live) if (!p.debt && p.supplyApy != null) supplyApy.set(`${p.pool}:${p.collateral}`, p.supplyApy);
    for (const p of live) {
      if (!p.debt || p.borrowPaused || (p.poolStatus ?? 0) >= 2 || p.borrowApy == null) continue;
      if ((p.marketSizeUsd ?? 0) < MIN_LEND_USD) continue;
      const usdPeg = (c: string) => c.startsWith("USD") || c === "PYUSD" || YIELD_BEARING.has(c);
      const pegged = (usdPeg(p.collateral) && usdPeg(p.debt)) || (p.collateral === "EURC" && p.debt === "EURC");
      if (!pegged || p.collateral === p.debt) continue;
      const sApy = supplyApy.get(`${p.pool}:${p.collateral}`) ?? p.supplyApy ?? 0;
      const L = Math.min(3, levNum(p.maxLev));
      if (!(L > 1.2)) continue;
      const net = sApy * L - p.borrowApy * (L - 1);
      if (!(net > sApy + 0.25)) continue;
      out.push({
        id: `loop-${p.protocol}-${p.pool}-${p.collateral}-${p.debt}`,
        lane: "loops",
        protocol: p.protocol,
        venue: p.poolName,
        assets: [p.collateral, p.debt],
        title: `Loop ${p.collateral} with ${p.debt}`,
        metric: { label: `Net APY at ${L.toFixed(1)}x`, value: pct(net) },
        facts: [
          { label: `${p.collateral} supply`, value: pct(sApy) },
          { label: `${p.debt} borrow`, value: pct(p.borrowApy) },
          { label: "Max leverage", value: p.maxLev },
        ],
        risk: (p.marketSizeUsd ?? 0) < THIN_USD ? "High" : "Medium",
        thin: (p.marketSizeUsd ?? 0) < THIN_USD ? `Thin market (${usd(p.marketSizeUsd ?? 0)}): rates swing as the loop opens.` : undefined,
        apy: net,
        tvl: p.marketSizeUsd ?? 0,
        lev: L,
        cta: { label: "Open loop", go: () => openMarket(p.protocol, p.collateral, p.debt, "create") },
      });
    }
    // ----- Liquidity: deepest pools per DEX.
    const byDex = new Map<string, DexRow[]>();
    for (const r of dex ?? []) {
      if (!(r.tvlUsd != null && r.tvlUsd >= 10_000)) continue;
      byDex.set(r.protocol, [...(byDex.get(r.protocol) ?? []), r]);
    }
    for (const [proto, rows] of byDex) {
      for (const r of rows.sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0)).slice(0, 6)) {
        const codes = r.assets.map((a) => a.code);
        const stable = codes.every((c) => STABLES.has(c));
        out.push({
          id: `dex-${r.address}`,
          lane: "liquidity",
          protocol: proto,
          venue: PROTO[proto]?.label ?? proto,
          assets: codes,
          title: `${r.pair} liquidity`,
          // Aqua publishes pool APY (fees + rewards); other venues have no
          // yield source, so their card leads with depth instead.
          metric: r.apyPct != null ? { label: "Pool APY", value: pct(r.apyPct) } : { label: "TVL", value: usd(r.tvlUsd ?? 0) },
          facts: [
            ...(r.apyPct != null ? [{ label: "TVL", value: usd(r.tvlUsd ?? 0) }] : []),
            ...(r.volume24hUsd != null ? [{ label: "24h volume", value: usd(r.volume24hUsd) }] : []),
            { label: "Fee", value: r.feeBps != null ? `${(r.feeBps / 100).toFixed(2)}%` : "—" },
            { label: "Type", value: r.poolType === "concentrated" ? "Concentrated" : r.poolType === "stable" ? "Stable" : "Constant product" },
          ].slice(0, 3),
          risk: stable ? "Low" : "Medium",
          apy: r.apyPct ?? 0,
          tvl: r.tvlUsd ?? 0,
          lev: 1,
          cta: { label: "View pool", go: () => router.push(`/markets/${proto}/pool/${r.address}`) },
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pools, vaults, dex]);

  // Progressive: cards render as each feed arrives; skeletons only while
  // nothing has landed yet.
  const loading = pools == null || vaults == null || dex == null;
  const nothingYet = pools == null && vaults == null && dex == null;
  const inLane = opps.filter((o) => lane === "all" || o.lane === lane);
  const assetChips = useMemo(() => {
    const count = new Map<string, number>();
    for (const o of inLane) for (const a of o.assets) count.set(a, (count.get(a) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a);
  }, [inLane]);
  const q = query.trim().toLowerCase();
  const shown = inLane
    .filter((o) => assets.length === 0 || o.assets.some((a) => assets.includes(a)))
    .filter((o) => risk === "Any" || o.risk === risk)
    .filter((o) => !q || `${o.title} ${o.venue} ${o.protocol} ${o.assets.join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => (sort === "tvl" ? b.tvl - a.tvl : sort === "lev" ? b.lev - a.lev : b.apy - a.apy));

  // Pulse: totals across everything tracked.
  const pulse = useMemo(() => {
    const poolTvl = new Map<string, number>();
    for (const p of pools ?? []) if (p.marketSizeUsd != null) poolTvl.set(p.pool, p.marketSizeUsd);
    const lendTvl = [...poolTvl.values()].reduce((s, v) => s + v, 0);
    const vaultTvl = (vaults ?? []).reduce((s, v) => s + v.tvlUsd, 0);
    const dexTvl = (dex ?? []).reduce((s, r) => s + (r.tvlUsd ?? 0), 0);
    const stableYield = opps
      .filter((o) => o.lane === "earn" && o.risk === "Low" && o.tvl >= HEADLINE_USD)
      .sort((a, b) => b.apy - a.apy)[0];
    const xlmLev = opps.filter((o) => o.lane === "leverage" && o.title.startsWith("Long XLM")).sort((a, b) => b.lev - a.lev)[0];
    return { tvl: lendTvl + vaultTvl + dexTvl, stableYield, xlmLev };
  }, [pools, vaults, dex, opps]);

  const go = (l: Lane) => {
    const slug = LANES.find((x) => x.id === l)?.slug ?? "all";
    setLane(l);
    try {
      const url = new URL(window.location.href);
      if (l === "all") url.searchParams.delete("lane");
      else url.searchParams.set("lane", slug);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* lane still switches */
    }
    setAssets([]);
  };
  const laneMeta = LANES.find((l) => l.id === lane)!;

  return (
    <div className="dc" id="opportunities">
      <header className="dc-hero">
        <div>
          <h1>Opportunities</h1>
          <p>{laneMeta.blurb}</p>
        </div>
        <div className="dc-pulse">
          <div>
            <span>Tracked TVL</span>
            <b>{loading ? "…" : usd(pulse.tvl)}</b>
          </div>
          <div>
            <span>Best stable yield</span>
            <b className="up">{pulse.stableYield ? pulse.stableYield.metric.value : "…"}</b>
            {pulse.stableYield && (
              <small>
                {PROTO[pulse.stableYield.protocol]?.label} · {pulse.stableYield.venue} · {usd(pulse.stableYield.tvl)}
              </small>
            )}
          </div>
          <div>
            <span>Long XLM up to</span>
            <b>{pulse.xlmLev ? `${pulse.xlmLev.lev.toFixed(1)}x` : "…"}</b>
            {pulse.xlmLev && <small>{PROTO[pulse.xlmLev.protocol]?.label} · {pulse.xlmLev.venue}</small>}
          </div>
          <div>
            <span>Live opportunities</span>
            <b>{loading ? "…" : opps.length}</b>
          </div>
        </div>
      </header>

      <nav className="dc-lanes" role="tablist" aria-label="Opportunity lanes">
        {LANES.map((l) => {
          const n = l.id === "all" ? opps.length : opps.filter((o) => o.lane === l.id).length;
          return (
            <button key={l.id} role="tab" aria-selected={lane === l.id} className={`dc-lane${lane === l.id ? " on" : ""}`} onClick={() => go(l.id)}>
              {l.label}
              {!loading && <em>{n}</em>}
            </button>
          );
        })}
      </nav>

      <div className="dc-tools">
        <input className="dc-search" placeholder="Search asset, protocol, vault…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <EvMultiSelect
          label="assets"
          allLabel="All assets"
          options={assetChips.map((a) => ({ value: a, label: a, icon: <TokenIcon symbol={a} size={20} /> }))}
          selected={assets}
          onToggle={(a) => setAssets((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]))}
          onClear={() => setAssets([])}
        />
        <EvSelect<Risk | "Any">
          label="Risk"
          value={risk}
          onChange={setRisk}
          options={[
            { value: "Any", label: "Any risk" },
            { value: "Low", label: "Low risk" },
            { value: "Medium", label: "Medium risk" },
            { value: "High", label: "High risk" },
          ]}
        />
        <EvSelect<"apy" | "tvl" | "lev">
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: "apy", label: "Sort: yield" },
            { value: "tvl", label: "Sort: size" },
            { value: "lev", label: "Sort: leverage" },
          ]}
        />
      </div>

      {nothingYet || (loading && shown.length === 0) ? (
        <div className="dc-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="dc-card dc-skel" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="dc-empty">No live opportunities match these filters right now.</p>
      ) : (
        <div className="dc-grid">
          {shown.map((o) => {
            const p = PROTO[o.protocol];
            return (
              <article key={o.id} className={`dc-card lane-${o.lane}`}>
                <div className="dc-top">
                  <span className="dc-venue">
                    {p && <img loading="lazy" src={p.logo} alt="" width={18} height={18} />}
                    <b>{p?.label ?? o.protocol}</b>
                    <small>{o.venue}</small>
                  </span>
                  <span className={`dc-risk r-${o.risk.toLowerCase()}`}>{o.risk}</span>
                </div>
                <div className="dc-title">
                  <span className="dc-icons">
                    {o.assets.slice(0, 2).map((a) => (
                      <TokenIcon key={a} symbol={a} size={26} />
                    ))}
                  </span>
                  <h3>{o.title}</h3>
                </div>
                <div className={`dc-metric${o.metric.label.includes("APY") ? " is-yield" : ""}`}>
                  <span>{o.metric.label}</span>
                  <b>{o.metric.value}</b>
                </div>
                {o.thin && (
                  <p className="dc-thin" title={o.thin}>
                    <i aria-hidden="true">!</i> {o.thin}
                  </p>
                )}
                <dl className="dc-facts">
                  {o.facts.map((f) => (
                    <div key={f.label}>
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="dc-actions">
                  <button className="btn primary" onClick={o.cta.go}>
                    {o.cta.label}
                  </button>
                  {o.alt && (
                    <button className="btn" onClick={o.alt.go}>
                      {o.alt.label}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <LeverageModal
        open={leverage != null}
        onClose={() => setLeverage(null)}
        asset={leverage?.asset ?? "XLM"}
        direction={leverage?.direction ?? "long"}
      />
    </div>
  );
}
