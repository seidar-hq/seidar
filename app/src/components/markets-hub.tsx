"use client";

/* Markets sections: Lend & Borrow, Pools and Vaults gather every venue of
   their kind in one card (the Manage "Assets" card pattern): venue pills
   (All + each venue), a Markets / Your positions switch, filters, rows and
   paging. Rows open the venue's own Manage page. Everything is live: pool
   and vault boards from the API, positions read for the connected wallet
   and each of its smart accounts. */

import { MarketStatusPill } from "./market-status";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { LoadingMark } from "./loading";
import { ProtoMark } from "./proto-mark";
import { TokenIcon } from "./token-icon";
import { isSmartAddress, useSmartAccount } from "./smart-gate";

/* ---------------- shared ---------------- */

const fmtUsd = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
};
const fmtInt = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString());
const fmtAmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 0 : v >= 1 ? 2 : 6 });
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** The connected wallet plus every smart account it owns. */
function useScopeAddrs(): string[] {
  const { owner, smarts } = useSmartAccount();
  return useMemo(() => [...new Set([owner, ...smarts].filter((a): a is string => !!a))], [owner, smarts]);
}

/** Overlapping token logos (+N past four). */
function Stack({ codes, size = 22, contracts }: { codes: string[]; size?: number; contracts?: (string | undefined)[] }) {
  const shown = codes.slice(0, 4);
  return (
    <span className="mh-stack">
      {shown.map((c, i) => (
        <TokenIcon key={`${c}${i}`} symbol={c} size={size} contract={contracts?.[i]} />
      ))}
      {codes.length > shown.length && <small>+{codes.length - shown.length}</small>}
    </span>
  );
}

function WalletCell({ account }: { account: string }) {
  return (
    <span className="mh-wallet">
      <small>{isSmartAddress(account) ? "Smart wallet" : "Wallet"}</small>
      <b>{short(account)}</b>
    </span>
  );
}

type Venue = { id: string; label: string };

/** A whole row / card that opens `href` (the same place its Manage button
 *  goes), highlighted on hover. Clicks on its own links / buttons keep
 *  their own behavior. */
function ClickRow({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <div
      className={`${className} mh-click`}
      role="link"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, select")) return;
        router.push(href);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) router.push(href);
      }}
    >
      {children}
    </div>
  );
}

/** Compact filter dropdown (the app's own, not the browser's): a pill with
 *  the picked label, a caret inset from the edge, a card-fill list. */
function HubSelect<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const picked = options.find((o) => o.value === value);
  return (
    <div className="mh-sel" ref={ref}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        <span>{picked?.label ?? label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="mh-sel-drop" role="listbox" aria-label={label}>
          {options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={o.value === value ? "on" : ""}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Card shell: kicker, venue pills, Markets / Your positions, count. */
function HubCard({
  kicker,
  venues,
  venue,
  setVenue,
  mode,
  setMode,
  positions,
  count,
  tools,
  children,
}: {
  kicker?: string;
  venues: Venue[];
  venue: string;
  setVenue: (v: string) => void;
  mode?: "markets" | "positions";
  setMode?: (m: "markets" | "positions") => void;
  positions?: number | null;
  count: string;
  tools?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="pf-card proto-assets mh-card">
      <div className="proto-assets-head mh-head">
        {kicker ? <small className="proto-kicker">{kicker}</small> : null}
        <div className="tabs mh-venues" role="tablist" aria-label={`${kicker ?? "Venue"} venues`}>
          {[{ id: "all", label: "All" }, ...venues].map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={venue === v.id}
              className={`tab${venue === v.id ? " active" : ""}`}
              onClick={() => setVenue(v.id)}
            >
              {v.id !== "all" && <ProtoMark id={v.id} size={16} />}
              {v.label}
            </button>
          ))}
        </div>
        {tools}
        {mode && setMode && (
          <div className="tabs mh-mode" role="tablist" aria-label="View">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "markets"}
              className={`tab${mode === "markets" ? " active" : ""}`}
              onClick={() => setMode("markets")}
            >
              Markets
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "positions"}
              className={`tab${mode === "positions" ? " active" : ""}`}
              onClick={() => setMode("positions")}
            >
              Your positions{positions != null && positions > 0 ? <em className="mh-badge">{positions}</em> : null}
            </button>
          </div>
        )}
        <span className="proto-count">{count}</span>
      </div>
      {children}
    </div>
  );
}

function Pager({
  page,
  pages,
  setPage,
  perPage,
  setPerPage,
}: {
  page: number;
  pages: number;
  setPage: (p: number) => void;
  perPage: number;
  setPerPage: (n: number) => void;
}) {
  return (
    <div className="mh-pager">
      <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        Prev
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button type="button" className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>
        Next
      </button>
      <label className="mh-perpage">
        Show
        <HubSelect
          value={perPage}
          label="Rows per page"
          options={[20, 50, 100].map((n) => ({ value: n, label: String(n) }))}
          onChange={(n) => {
            setPerPage(n);
            setPage(1);
          }}
        />
      </label>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="pf-empty mh-empty">{children}</p>;
}

function Loading({ what }: { what: string }) {
  return (
    <p className="pf-empty mh-empty load-row">
      <LoadingMark size={14} /> Loading {what}…
    </p>
  );
}

/** Per-address JSON reads merged; null while loading. */
function useScoped<T>(path: (addr: string) => string, pick: (d: Record<string, unknown>, addr: string) => T[], deps: string) {
  const addrs = useScopeAddrs();
  const key = addrs.join(",");
  const [rows, setRows] = useState<T[] | null>(null);
  useEffect(() => {
    if (addrs.length === 0) {
      setRows([]);
      return;
    }
    let dead = false;
    setRows(null);
    const load = () =>
      Promise.all(
        addrs.map((a) =>
          apiFetch(path(a), { cache: "no-store" })
            .then((r) => r.json())
            .then((d) => (d?.ok ? pick(d, a) : []))
            .catch(() => [] as T[]),
        ),
      ).then((all) => !dead && setRows(all.flat()));
    load();
    window.addEventListener("seidar:refresh", load);
    return () => {
      dead = true;
      window.removeEventListener("seidar:refresh", load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, deps]);
  return { rows, connected: addrs.length > 0 };
}

/* ================= Pools ================= */

const DEX_VENUES: Venue[] = [
  { id: "soroswap", label: "Soroswap" },
  { id: "phoenix", label: "Phoenix" },
  { id: "aqua", label: "Aqua" },
  { id: "sushi", label: "Sushi" },
];
type DexRow = {
  protocol: string;
  address: string;
  pair: string;
  assets: { contract: string; code: string }[];
  poolType: string | null;
  feeBps: number | null;
  trades: number | null;
  tvlUsd: number | null;
  /** Venue-published (Aqua) or fee APY from the last 7 days of swaps. */
  apyPct?: number | null;
  /** Aqua: last 24h. */
  volume24hUsd?: number | null;
  /** Soroswap / Phoenix / Sushi: last 7 days of swaps. */
  volume7dUsd?: number | null;
  trades7d?: number;
};
/** Daily USD volume: Aqua's last 24h, else the 7-day daily average. */
const dailyVol = (r: DexRow) => (r.volume24hUsd != null ? r.volume24hUsd : r.volume7dUsd != null ? r.volume7dUsd / 7 : null);
type LpPos = {
  protocol: string;
  pool: string;
  pair: string;
  underlying: { code: string; amount: number }[];
  valueUsd: number | null;
  sharePct: number | null;
  rewards?: { amount: number; usd: number | null } | null;
  account: string;
};
const poolTypeLabel = (t: string | null) =>
  t === "constant_product" || t === "xyk" ? "Constant product" : t === "stable" ? "Stable" : t === "concentrated" ? "Concentrated" : t ?? "—";

export function PoolsHub() {
  const [venue, setVenue] = useState("all");
  const [mode, setMode] = useState<"markets" | "positions">("markets");
  const [byVenue, setByVenue] = useState<Record<string, DexRow[] | "error">>({});
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState("");
  const [sort, setSort] = useState<"tvl" | "apy" | "volume" | "fee" | "pair">("tvl");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const positions = useScoped<LpPos>(
    (a) => `/api/dex/positions?address=${a}`,
    (d, a) => ((d.positions ?? []) as LpPos[]).map((p) => ({ ...p, account: a })),
    "lp",
  );

  useEffect(() => {
    let dead = false;
    for (const v of DEX_VENUES)
      apiFetch(`/api/dex/pools?protocol=${v.id}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => !dead && setByVenue((m) => ({ ...m, [v.id]: d?.ok && Array.isArray(d.rows) ? (d.rows as DexRow[]) : "error" })))
        .catch(() => !dead && setByVenue((m) => ({ ...m, [v.id]: "error" })));
    return () => {
      dead = true;
    };
  }, []);

  const loaded = DEX_VENUES.filter((v) => Array.isArray(byVenue[v.id]));
  const failed = DEX_VENUES.filter((v) => byVenue[v.id] === "error");
  const all = useMemo(
    () => DEX_VENUES.flatMap((v) => (Array.isArray(byVenue[v.id]) ? (byVenue[v.id] as DexRow[]) : [])),
    [byVenue],
  );
  const inVenue = venue === "all" ? all : all.filter((r) => r.protocol === venue);
  const types = [...new Set(inVenue.map((r) => r.poolType).filter((t): t is string => !!t))].sort();
  const needle = q.trim().toLowerCase();
  const filtered = inVenue
    .filter((r) => (!typeF || r.poolType === typeF) && (!needle || r.pair.toLowerCase().includes(needle) || r.address.toLowerCase().includes(needle)))
    .sort((a, b) => {
      const n = (v: number | null) => (typeof v === "number" ? v : -1);
      if (sort === "pair") return a.pair.localeCompare(b.pair);
      if (sort === "fee") return n(a.feeBps) - n(b.feeBps);
      if (sort === "apy") return n(b.apyPct ?? null) - n(a.apyPct ?? null);
      if (sort === "volume") return n(dailyVol(b)) - n(dailyVol(a));
      return n(b.tvlUsd) - n(a.tvlUsd);
    });
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const cur = Math.min(page, pages);
  const slice = filtered.slice((cur - 1) * perPage, cur * perPage);
  const myPos = (positions.rows ?? []).filter((p) => venue === "all" || p.protocol === venue);
  const tvl = inVenue.reduce((s, r) => s + (r.tvlUsd ?? 0), 0);

  return (
    <HubCard
      kicker="POOLS"
      venues={DEX_VENUES}
      venue={venue}
      setVenue={(v) => {
        setVenue(v);
        setPage(1);
        setTypeF("");
      }}
      mode={mode}
      setMode={setMode}
      positions={positions.rows?.length ?? null}
      count={mode === "markets" ? `${inVenue.length} pools · ${fmtUsd(tvl)} TVL` : `${myPos.length} positions`}
    >
      {mode === "markets" ? (
        <>
          <div className="mh-filters">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search pair or pool address…"
              aria-label="Search pools"
            />
            <HubSelect
              value={typeF}
              label="Pool type"
              options={[{ value: "", label: "All types" }, ...types.map((t) => ({ value: t, label: poolTypeLabel(t) }))]}
              onChange={(v) => (setTypeF(v), setPage(1))}
            />
            <HubSelect
              value={sort}
              label="Sort pools"
              options={[
                { value: "tvl" as const, label: "Sort: TVL" },
                { value: "apy" as const, label: "Sort: APY" },
                { value: "volume" as const, label: "Sort: Volume" },
                { value: "fee" as const, label: "Sort: Fee" },
                { value: "pair" as const, label: "Sort: Pair A–Z" },
              ]}
              onChange={setSort}
            />
          </div>
          {failed.length > 0 && <p className="mh-note">Unreachable right now: {failed.map((v) => v.label).join(", ")}.</p>}
          {loaded.length > 0 && loaded.length + failed.length < DEX_VENUES.length && (
            <p className="mh-note load-row">
              <LoadingMark size={12} /> Still loading{" "}
              {DEX_VENUES.filter((v) => byVenue[v.id] === undefined)
                .map((v) => v.label)
                .join(", ")}
              …
            </p>
          )}
          {loaded.length === 0 && failed.length < DEX_VENUES.length ? (
            <Loading what="pools" />
          ) : (
            <div className="proto-tablewrap">
              <div className="proto-thead mh-grid mh-pools">
                <span>Pair</span>
                <span>Venue</span>
                <span>Type</span>
                <span>Fee</span>
                <span>APY</span>
                <span title="Aqua: last 24 hours. Soroswap, Phoenix, Sushi: average day over the last 7 days of swaps.">Daily volume</span>
                <span>TVL</span>
                <span />
              </div>
              {slice.map((r) => (
                <ClickRow key={r.address} href={`/markets/${r.protocol}/pool/${r.address}`} className="proto-trow mh-grid mh-pools">
                  <span className="mh-name">
                    <Stack codes={r.assets.map((a) => a.code)} contracts={r.assets.map((a) => a.contract)} />
                    <span>
                      <b>{r.pair}</b>
                      <small title={r.address}>{short(r.address)}</small>
                    </span>
                  </span>
                  <span className="mh-venue">
                    <ProtoMark id={r.protocol} size={18} />
                    {DEX_VENUES.find((v) => v.id === r.protocol)?.label}
                  </span>
                  <span>{poolTypeLabel(r.poolType)}</span>
                  <span>{r.feeBps != null ? `${(r.feeBps / 100).toFixed(2)}%` : "—"}</span>
                  <span className="mh-apy" title={r.protocol === "aqua" ? "Aqua's published APY (fees + AQUA rewards)" : "Fee APY from the last 7 days of swaps"}>
                    {r.apyPct != null ? `${r.apyPct < 0.01 && r.apyPct > 0 ? "<0.01" : r.apyPct.toFixed(2)}%` : "—"}
                  </span>
                  <span title={r.protocol === "aqua" ? "Last 24 hours" : `${r.trades7d ?? 0} swaps in 7 days`}>{dailyVol(r) != null ? fmtUsd(dailyVol(r)) : "—"}</span>
                  <span>{fmtUsd(r.tvlUsd)}</span>
                  <span className="mh-act">
                    <Link className="btn mk-create" href={`/markets/${r.protocol}/pool/${r.address}`}>
                      Manage
                    </Link>
                  </span>
                </ClickRow>
              ))}
              {slice.length === 0 && loaded.length > 0 && <Empty>No pools match this filter.</Empty>}
            </div>
          )}
          {filtered.length > perPage && <Pager page={cur} pages={pages} setPage={setPage} perPage={perPage} setPerPage={setPerPage} />}
          <p className="mh-note">TVL prices on-chain reserves with live feeds; pools with no priced leg show —.</p>
        </>
      ) : !positions.connected ? (
        <Empty>Connect a wallet to see your liquidity positions.</Empty>
      ) : positions.rows == null ? (
        <Loading what="your liquidity positions" />
      ) : myPos.length === 0 ? (
        <Empty>No liquidity positions{venue === "all" ? "" : ` on ${DEX_VENUES.find((v) => v.id === venue)?.label}`} for your wallets.</Empty>
      ) : (
        <div className="proto-tablewrap">
          <div className="proto-thead mh-grid mh-lp">
            <span>Pair</span>
            <span>Wallet</span>
            <span>Your liquidity</span>
            <span>Value</span>
            <span>Pool share</span>
            <span>Rewards</span>
            <span />
          </div>
          {myPos.map((p) => (
            <ClickRow key={`${p.account}-${p.pool}`} href={`/markets/${p.protocol}/pool/${p.pool}`} className="proto-trow mh-grid mh-lp">
              <span className="mh-name">
                <Stack codes={p.underlying.map((u) => u.code)} />
                <span>
                  <b>{p.pair}</b>
                  <small className="mh-venue">
                    <ProtoMark id={p.protocol} size={14} />
                    {DEX_VENUES.find((v) => v.id === p.protocol)?.label}
                  </small>
                </span>
              </span>
              <WalletCell account={p.account} />
              <span className="mh-legs">
                {p.underlying.map((u) => (
                  <small key={u.code}>
                    {fmtAmt(u.amount)} {u.code}
                  </small>
                ))}
              </span>
              <span>{fmtUsd(p.valueUsd)}</span>
              <span>{p.sharePct != null ? `${p.sharePct < 0.01 ? "<0.01" : p.sharePct.toFixed(2)}%` : "—"}</span>
              <span>{p.rewards ? `${fmtAmt(p.rewards.amount)} AQUA` : "—"}</span>
              <span className="mh-act">
                <Link className="btn mk-create" href={`/markets/${p.protocol}/pool/${p.pool}`}>
                  Manage
                </Link>
              </span>
            </ClickRow>
          ))}
        </div>
      )}
    </HubCard>
  );
}

/* ================= Vaults ================= */

const VAULT_VENUES: Venue[] = [
  { id: "defindex", label: "DeFindex" },
  { id: "upshift", label: "Upshift" },
];
type VaultRow = {
  protocol: string;
  address: string;
  name: string;
  assetCode: string;
  tvlUsd: number | null;
  apyPct: number | null;
  curator?: string;
};
function VaultLogo({ token, proto, size = 30 }: { token: string; proto: string; size?: number }) {
  return (
    <span className="posx-badged">
      <TokenIcon symbol={token} size={size} />
      <span className="posx-badge">
        <ProtoMark id={proto} size={Math.round(size * 0.45)} />
      </span>
    </span>
  );
}

type VaultSortKey = "apy" | "tvl";
type VaultSort = { key: VaultSortKey; dir: "asc" | "desc" };

function SortCaret({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className={`mh-caret${dir ? " on" : ""}`}>
      {dir === "asc" ? <path d="M4 1.4 7.1 6.4H.9z" fill="currentColor" /> : <path d="M4 6.6.9 1.6h6.2z" fill="currentColor" />}
    </svg>
  );
}

const VC_ROTATE_MS = 4200;
const VC_SLIDE_MS = 660;

/* Featured vaults for the strip — a fixed showcase in exactly this order,
   independent of the table's venue filter, search, asset filter and sort. */
const SHOWCASE_VAULT_NAMES = [
  "Gami earnUSDC",
  "Gami earnXLM",
  "Beans Eurc Vault",
  "Beans Usdc Vault",
  "USDC Soroswap Earn",
];
const normalizeVaultName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/* Top-vaults strip: three cards visible; every few seconds the row slides one
   card left — the first card leaves to the left, the next enters from the
   right (clones at the end make the loop seamless). */
function VaultCarousel({ vaults }: { vaults: VaultRow[] }) {
  const n = vaults.length;
  const rotate = n > 3;
  const [pos, setPos] = useState(0);
  const [anim, setAnim] = useState(true);
  useEffect(() => {
    if (!rotate) return;
    const t = setInterval(() => {
      setAnim(true);
      setPos((p) => p + 1);
    }, VC_ROTATE_MS);
    return () => clearInterval(t);
  }, [rotate]);
  useEffect(() => {
    if (!rotate || pos < n) return;
    const t = setTimeout(() => {
      setAnim(false);
      setPos(0);
    }, VC_SLIDE_MS);
    return () => clearTimeout(t);
  }, [pos, n, rotate]);
  useEffect(() => {
    if (anim) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setAnim(true)));
    return () => cancelAnimationFrame(r);
  }, [anim]);
  const items = rotate ? vaults.concat(vaults.slice(0, 3)) : vaults;
  return (
    <div className="vc-strip" aria-label="Top vaults">
      <div className={`vc-track${anim ? "" : " no-anim"}`} style={{ transform: `translateX(calc(${-pos} * (33.3333% + 5.3333px)))` }}>
        {items.map((r, i) => (
          <article className="vc-card" key={`${r.address}-${i}`}>
            <span className="vc-chip">
              <ProtoMark id={r.protocol} size={15} />
              {VAULT_VENUES.find((v) => v.id === r.protocol)?.label ?? r.protocol}
            </span>
            <b className="vc-name" title={r.name}>{r.name}</b>
            <div className="vc-rows">
              <div className="vc-row">
                <span className="vc-label">APY</span>
                <b>{r.apyPct != null ? `${r.apyPct.toFixed(2)}%` : "—"}</b>
              </div>
              <div className="vc-row">
                <span className="vc-label">TVL</span>
                <b>{fmtUsd(r.tvlUsd)}</b>
              </div>
            </div>
            <Link className="btn mk-create vc-cta" href={`/vaults/${r.protocol}/${r.address}`}>
              Deposit
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}

export function VaultsHub() {
  const [venue, setVenue] = useState("all");
  const [rows, setRows] = useState<VaultRow[] | "error" | null>(null);
  const [q, setQ] = useState("");
  const [asset, setAsset] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [sort, setSort] = useState<VaultSort>({ key: "apy", dir: "desc" });
  useEffect(() => {
    let dead = false;
    apiFetch("/api/vaults", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => !dead && setRows(d?.ok && Array.isArray(d.rows) ? (d.rows as VaultRow[]) : "error"))
      .catch(() => !dead && setRows("error"));
    return () => {
      dead = true;
    };
  }, []);
  const list = Array.isArray(rows) ? rows : [];
  const inVenue = venue === "all" ? list : list.filter((r) => r.protocol === venue);
  const assets = [...new Set(inVenue.map((r) => r.assetCode))].sort();
  const needle = q.trim().toLowerCase();
  const filtered = inVenue.filter(
    (r) => (!asset || r.assetCode === asset) && (!needle || `${r.name} ${r.assetCode} ${r.address}`.toLowerCase().includes(needle)),
  );
  const sorted = [...filtered].sort((a, b) => {
    const av = (sort.key === "apy" ? a.apyPct : a.tvlUsd) ?? -1;
    const bv = (sort.key === "apy" ? b.apyPct : b.tvlUsd) ?? -1;
    return sort.dir === "desc" ? bv - av : av - bv;
  });
  const pages = Math.max(1, Math.ceil(sorted.length / perPage));
  const cur = Math.min(page, pages);
  const slice = sorted.slice((cur - 1) * perPage, cur * perPage);
  const tvl = inVenue.reduce((s, r) => s + (r.tvlUsd ?? 0), 0);
  const label = (id: string) => VAULT_VENUES.find((v) => v.id === id)?.label ?? id;
  const strip = SHOWCASE_VAULT_NAMES.map((want) =>
    list.find((r) => normalizeVaultName(r.name) === normalizeVaultName(want)),
  ).filter((r): r is VaultRow => !!r);
  function toggleSort(key: VaultSortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
    setPage(1);
  }

  return (
    <>
      {strip.length > 0 && <VaultCarousel vaults={strip} />}
      <HubCard
        venues={VAULT_VENUES}
        venue={venue}
        setVenue={(v) => {
          setVenue(v);
          setPage(1);
          setAsset("");
        }}
        count={`${inVenue.length} vaults · ${fmtUsd(tvl)} TVL`}
        tools={
          <div className="mh-filters mh-headtools">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search vault, asset or address…"
              aria-label="Search vaults"
            />
            <HubSelect
              value={asset}
              label="Deposit asset"
              options={[{ value: "", label: "All assets" }, ...assets.map((a) => ({ value: a, label: a }))]}
              onChange={(v) => (setAsset(v), setPage(1))}
            />
          </div>
        }
      >
        {rows === null ? (
          <Loading what="vaults" />
        ) : rows === "error" ? (
          <Empty>Vault feed unreachable — reload to retry.</Empty>
        ) : (
          <div className="proto-tablewrap mh-anim" key={venue}>
            <div className="proto-thead mh-grid mh-vaults">
              <span>Vault</span>
              <span>Venue</span>
              <span>Asset</span>
              <span>
                <button type="button" className="mh-sort" onClick={() => toggleSort("apy")}>
                  APY
                  <SortCaret dir={sort.key === "apy" ? sort.dir : null} />
                </button>
              </span>
              <span>
                <button type="button" className="mh-sort" onClick={() => toggleSort("tvl")}>
                  TVL
                  <SortCaret dir={sort.key === "tvl" ? sort.dir : null} />
                </button>
              </span>
              <span />
            </div>
            {slice.map((r) => (
              <ClickRow key={r.address} href={`/vaults/${r.protocol}/${r.address}`} className="proto-trow mh-grid mh-vaults">
                <span className="mh-name">
                  <VaultLogo token={r.assetCode} proto={r.protocol} />
                  <span>
                    <b>{r.name}</b>
                    <small>{r.curator ? `Curated by ${r.curator}` : short(r.address)}</small>
                  </span>
                </span>
                <span className="mh-venue">
                  <ProtoMark id={r.protocol} size={18} />
                  {label(r.protocol)}
                </span>
                <span className="mh-venue">
                  <TokenIcon symbol={r.assetCode} size={18} />
                  {r.assetCode}
                </span>
                <span className="mh-apy">{r.apyPct != null ? `${r.apyPct.toFixed(2)}%` : "—"}</span>
                <span>{fmtUsd(r.tvlUsd)}</span>
                <span className="mh-act">
                  <Link
                    className="btn mk-create mh-chev"
                    href={`/vaults/${r.protocol}/${r.address}`}
                    aria-label={`Open ${r.name}`}
                  >
                    <svg width="7" height="11" viewBox="0 0 7 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 1l4.5 4.5L1 10" />
                    </svg>
                  </Link>
                </span>
              </ClickRow>
            ))}
            {slice.length === 0 && <Empty>No vaults match this filter.</Empty>}
          </div>
        )}
        {sorted.length > perPage && <Pager page={cur} pages={pages} setPage={setPage} perPage={perPage} setPerPage={setPerPage} />}
      </HubCard>
    </>
  );
}

/* ================= Lend & Borrow ================= */

const LEND_VENUES: Venue[] = [
  { id: "blend", label: "Blend" },
  { id: "xoxno", label: "XOXNO" },
];
type MarketRow = {
  protocol: string;
  collateral: string;
  debt: string | null;
  pool: string;
  poolName: string;
  poolSupplied?: number | null;
  poolBorrowed?: number | null;
  poolStatus?: number | null;
  supplyApy?: number | null;
};
type PoolAsset = { pool: string; poolName: string; protocol: string; code: string; canCollateral?: boolean; canBorrow?: boolean };
type LendGroup = {
  protocol: string;
  name: string;
  addrs: string[];
  tvl: number;
  borrowed: number;
  collaterals: string[];
  debts: string[];
  assets: number;
  /** Most usable Blend status among the market's pools (null = unknown / XOXNO). */
  status: number | null;
};
type LendLeg = {
  protocol: "blend" | "xoxno";
  code: string;
  pool?: string;
  suppliedUsd: number;
  borrowedUsd: number;
  account: string;
  hf: number | null;
};

export function LendBorrowHub() {
  const [venue, setVenue] = useState("all");
  const [mode, setMode] = useState<"markets" | "positions">("markets");
  const [feed, setFeed] = useState<{ rows: MarketRow[]; assets: PoolAsset[] } | "error" | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({ blend: true, xoxno: true });
  const [retrying, setRetrying] = useState(true);
  const legs = useScoped<LendLeg>(
    (a) => `/api/positions?address=${a}`,
    (d, a) => {
      const per = (d.perProtocol ?? {}) as Record<string, { healthFactor?: number | null }>;
      return ((d.legs ?? []) as Omit<LendLeg, "account" | "hf">[]).map((l) => ({ ...l, account: a, hf: per[l.protocol]?.healthFactor ?? null }));
    },
    "lend",
  );
  // A venue missing from the board is a cold or blipped API cache, not an
  // empty venue: keep what loaded and re-read a few times until both land.
  useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (tries: number) => {
      apiFetch("/api/pools", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (dead) return;
          if (!d?.ok) throw new Error("feed");
          const rows = (d.rows ?? []) as MarketRow[];
          setFeed({ rows, assets: (d.assets ?? []) as PoolAsset[] });
          const missing = LEND_VENUES.some((v) => !rows.some((r) => r.protocol === v.id && r.poolName));
          if (missing && tries > 0) timer = setTimeout(() => load(tries - 1), 4000);
          else setRetrying(false);
        })
        .catch(() => {
          if (dead) return;
          if (tries > 0) timer = setTimeout(() => load(tries - 1), 4000);
          else (setFeed((f) => (f && f !== "error" ? f : "error")), setRetrying(false));
        });
    };
    load(5);
    return () => {
      dead = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  /* Pools per protocol, same-name pools merged, TVL counted once per pool
     address (as the Create browser does). */
  const groups = useMemo(() => {
    if (!feed || feed === "error") return [] as LendGroup[];
    const by = new Map<string, LendGroup & { seen: Set<string> }>();
    const get = (protocol: string, name: string) => {
      const k = `${protocol}|${name}`;
      let g = by.get(k);
      if (!g) {
        g = { protocol, name, addrs: [], tvl: 0, borrowed: 0, collaterals: [], debts: [], assets: 0, status: null, seen: new Set() };
        by.set(k, g);
      }
      return g;
    };
    // Every row of a pool stamps the same pool totals; some rows carry
    // none, so take each address's largest reading once.
    const sup = new Map<string, number>();
    const bor = new Map<string, number>();
    for (const r of feed.rows) {
      if (!r.poolName) continue;
      const g = get(r.protocol, r.poolName);
      if (!g.addrs.includes(r.pool)) g.addrs.push(r.pool);
      if (typeof r.poolStatus === "number") g.status = g.status == null ? r.poolStatus : Math.min(g.status, r.poolStatus);
      sup.set(r.pool, Math.max(sup.get(r.pool) ?? 0, r.poolSupplied ?? 0));
      bor.set(r.pool, Math.max(bor.get(r.pool) ?? 0, r.poolBorrowed ?? 0));
    }
    for (const a of feed.assets) {
      if (!a.poolName) continue;
      const g = get(a.protocol, a.poolName);
      if (!g.addrs.includes(a.pool)) g.addrs.push(a.pool);
      if (!g.seen.has(a.code)) {
        g.seen.add(a.code);
        g.assets += 1;
      }
      if (a.canCollateral && !g.collaterals.includes(a.code)) g.collaterals.push(a.code);
      if (a.canBorrow && !g.debts.includes(a.code)) g.debts.push(a.code);
    }
    for (const g of by.values()) {
      g.tvl = g.addrs.reduce((t, a) => t + (sup.get(a) ?? 0), 0);
      g.borrowed = g.addrs.reduce((t, a) => t + (bor.get(a) ?? 0), 0);
    }
    return [...by.values()].sort((a, b) => b.tvl - a.tvl);
  }, [feed]);

  const protos = LEND_VENUES.filter((v) => venue === "all" || v.id === venue);
  const myLegs = (legs.rows ?? []).filter((l) => (l.suppliedUsd > 0.01 || l.borrowedUsd > 0.01) && (venue === "all" || l.protocol === venue));
  const positions = useMemo(() => {
    const by = new Map<string, { protocol: string; pool: string | null; account: string; coll: string[]; debt: string[]; collUsd: number; debtUsd: number; hf: number | null }>();
    for (const l of myLegs) {
      const k = `${l.account}|${l.protocol}|${l.pool ?? ""}`;
      const p = by.get(k) ?? { protocol: l.protocol, pool: l.pool ?? null, account: l.account, coll: [], debt: [], collUsd: 0, debtUsd: 0, hf: l.hf };
      if (l.suppliedUsd > 0.01) (p.collUsd += l.suppliedUsd), p.coll.includes(l.code) || p.coll.push(l.code);
      if (l.borrowedUsd > 0.01) (p.debtUsd += l.borrowedUsd), p.debt.includes(l.code) || p.debt.push(l.code);
      by.set(k, p);
    }
    return [...by.values()];
  }, [myLegs]);
  const poolName = (protocol: string, addr: string | null) =>
    (addr && groups.find((g) => g.protocol === protocol && g.addrs.includes(addr))?.name) || null;
  const manageHref = (protocol: string, name: string | null) => `/markets/${protocol}${name ? `?pool=${encodeURIComponent(name)}` : ""}`;

  return (
    <HubCard
      kicker="LEND & BORROW"
      venues={LEND_VENUES}
      venue={venue}
      setVenue={setVenue}
      mode={mode}
      setMode={setMode}
      positions={legs.rows ? new Set(legs.rows.filter((l) => l.suppliedUsd > 0.01 || l.borrowedUsd > 0.01).map((l) => `${l.account}|${l.protocol}|${l.pool ?? ""}`)).size : null}
      count={mode === "markets" ? `${groups.filter((g) => venue === "all" || g.protocol === venue).length} markets` : `${positions.length} positions`}
    >
      {mode === "markets" ? (
        feed === null ? (
          <Loading what="lending markets" />
        ) : feed === "error" ? (
          <Empty>Lending feed unreachable — reload to retry.</Empty>
        ) : (
          <div className="mh-protos">
            {protos.map((v) => {
              const gs = groups.filter((g) => g.protocol === v.id);
              const tvl = gs.reduce((s, g) => s + g.tvl, 0);
              const borrowed = gs.reduce((s, g) => s + g.borrowed, 0);
              const isOpen = open[v.id] !== false;
              return (
                <section key={v.id} className="mh-proto">
                  <header className="mh-proto-head">
                    <ProtoMark id={v.id} size={34} />
                    <span>
                      <b>{v.label}</b>
                      <small>
                        {gs.length} {v.id === "xoxno" ? "hub" : "pool"}
                        {gs.length === 1 ? "" : "s"} · TVL {fmtUsd(tvl)} · Borrowed {fmtUsd(borrowed)}
                      </small>
                    </span>
                    <button
                      type="button"
                      className={`mk-chev mh-collapse${isOpen ? " open" : ""}`}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Collapse" : "Expand"} ${v.label} pools`}
                      onClick={() => setOpen((o) => ({ ...o, [v.id]: !isOpen }))}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </header>
                  {isOpen &&
                    (gs.length === 0 ? (
                      retrying ? (
                        <Loading what={`${v.label} markets`} />
                      ) : (
                        <Empty>{v.label} markets didn&apos;t load — reload to retry.</Empty>
                      )
                    ) : (
                      <div className="mh-pools-list">
                        {gs.map((g) => (
                          <ClickRow key={g.name} href={manageHref(g.protocol, g.name)} className="mk-card">
                            <div className="mk-row mh-lrow">
                              <span className="mk-name">
                                <ProtoMark id={g.protocol} size={26} />
                                <span>
                                  <b className="mk-name-row">
                                    {g.name}
                                    <MarketStatusPill status={g.status} small />
                                  </b>
                                  <small>
                                    {g.assets} asset{g.assets === 1 ? "" : "s"} · TVL: {fmtUsd(g.tvl)}
                                    {g.borrowed > 0 ? ` · Borrowed ${fmtUsd(g.borrowed)}` : ""}
                                  </small>
                                </span>
                              </span>
                              <span className="mk-assets">
                                <Stack codes={g.collaterals} />
                                <small>Collateral assets</small>
                              </span>
                              <span className="mk-assets">
                                <Stack codes={g.debts} />
                                <small>Debt assets</small>
                              </span>
                              <Link className="btn mk-create" href={manageHref(g.protocol, g.name)}>
                                Manage
                              </Link>
                            </div>
                          </ClickRow>
                        ))}
                      </div>
                    ))}
                </section>
              );
            })}
          </div>
        )
      ) : !legs.connected ? (
        <Empty>Connect a wallet to see your lending positions.</Empty>
      ) : legs.rows == null ? (
        <Loading what="your lending positions" />
      ) : positions.length === 0 ? (
        <Empty>No lending positions{venue === "all" ? "" : ` on ${venue === "blend" ? "Blend" : "XOXNO"}`} for your wallets.</Empty>
      ) : (
        <div className="proto-tablewrap">
          <div className="proto-thead mh-grid mh-lpos">
            <span>Market</span>
            <span>Wallet</span>
            <span>Collateral</span>
            <span>Debt</span>
            <span>Safety ratio</span>
            <span />
          </div>
          {positions.map((p) => {
            const name = poolName(p.protocol, p.pool);
            const tone = p.debtUsd <= 0.01 ? "" : p.hf == null ? "" : p.hf >= 1.5 ? " green" : p.hf >= 1.15 ? " amber" : " red";
            return (
              <ClickRow key={`${p.account}-${p.protocol}-${p.pool}`} href={manageHref(p.protocol, name)} className="proto-trow mh-grid mh-lpos">
                <span className="mh-name">
                  <ProtoMark id={p.protocol} size={30} />
                  <span>
                    <b>
                      {p.protocol === "blend" ? "Blend" : "XOXNO"}
                      {name ? ` · ${name}` : ""}
                    </b>
                    <small>Lending</small>
                  </span>
                </span>
                <WalletCell account={p.account} />
                <span className="mh-amt">
                  <Stack codes={p.coll} size={16} />
                  {fmtUsd(p.collUsd)}
                </span>
                <span className="mh-amt">
                  <Stack codes={p.debt} size={16} />
                  {p.debtUsd > 0.01 ? fmtUsd(p.debtUsd) : "—"}
                </span>
                <span>
                  <span className={`pill${tone}`}>{p.debtUsd <= 0.01 ? "No debt" : p.hf != null ? `${(p.hf * 100).toFixed(2)}%` : "—"}</span>
                </span>
                <span className="mh-act">
                  <Link className="btn mk-create" href={manageHref(p.protocol, name)}>
                    Manage
                  </Link>
                </span>
              </ClickRow>
            );
          })}
        </div>
      )}
    </HubCard>
  );
}
