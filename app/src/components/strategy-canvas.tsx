"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Recipe } from "@seidar/sdk";
import { TokenIcon } from "./token-icon";
import { LoadingMark } from "./loading";
import { apiFetch } from "@/lib/api";

/* Seidar strategy canvas — node-graph strategy composer on live Stellar
 * markets only (Blend / XOXNO lending rows + DeFindex / Upshift
 * earn vaults, live prices). Deposit source fans out into market nodes
 * with allocation splits; Create compiles real @seidar/sdk supply legs
 * into an unsigned Freighter intent. No mock markets, no invented APYs. */

type ProtoId = "blend" | "xoxno" | "defindex" | "upshift";

interface Market {
  id: string;
  protocol: ProtoId;
  kind: "lending" | "yield";
  name: string;
  sub: string;
  asset: string;
  /** Default asset (best supply APY). Nodes pick from `assets`. */
  assets: {
    code: string;
    supplyApy: number | null;
    borrowApy: number | null;
    /** Live LTV % from /api/pools (null when the leg omits it). */
    ltvPct: number | null;
    canBorrow: boolean;
  }[];
  apy: number | null;
  borrowApy: number | null;
  tvl: number | null;
}

/** Per-protocol supported node actions. */
type NodeAction =
  | "supply"
  | "borrow"
  | "repay"
  | "withdraw"
  | "deposit";
const ACTIONS_FOR: Record<"lending" | "yield", NodeAction[]> = {
  lending: ["supply", "borrow", "repay", "withdraw"],
  yield: ["deposit", "withdraw"],
};
const ACTION_LABEL: Record<NodeAction, string> = {
  supply: "Supply",
  borrow: "Borrow",
  repay: "Repay",
  withdraw: "Withdraw",
  deposit: "Deposit",
};
const DEFAULT_ACTION: Record<"lending" | "yield", NodeAction> = {
  lending: "supply",
  yield: "deposit",
};

interface CanvasNode {
  id: string;
  marketId: string;
  x: number;
  y: number;
  /** Ordered operations executed with the node's money, in sequence. */
  actions: NodeActionItem[];
}

/** One configured operation inside a node. Amounts are token units of
    `asset`; flows convert through live prices. */
interface NodeActionItem {
  id: string;
  kind: NodeAction;
  asset: string;
  /** Token amount ("" = not configured). */
  amount: string;
}

/** Allocation of one connection: percent of the source pool, a fixed USD
    amount, or the entire remaining pool. */
type AllocMode = "pct" | "fixed" | "entire";
interface FlowEdge {
  id: string;
  from: string; // "source" or node id
  to: string; // node id
  pct: number;
  mode: AllocMode;
  /** Fixed USD amount when mode === "fixed". */
  amount: number;
}

const NODE_W = 216;
/** Dust floor: flows at or below this carry no sendable value. */
const DUST_USD = 0.01;
const PLACEHOLDER =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const PROTO_META: Record<ProtoId, { label: string; logo: string | null }> = {
  blend: { label: "Blend", logo: "/protocol-blend.png" },
  xoxno: { label: "XOXNO", logo: "/protocol-xoxno.png" },
  defindex: { label: "DeFindex", logo: "/defindex-mark.svg" },
  upshift: { label: "Upshift", logo: "/upshift-logo.png" },
};

function CanvasProtoIcon({ id, size = 18 }: { id: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const meta = (PROTO_META as Record<string, { label: string; logo: string | null }>)[id];
  if (!meta?.logo || failed) {
    return (
      <span
        className="sc-protofb"
        aria-hidden="true"
        style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.45)) }}
      >
        {id.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img loading="lazy"
      src={meta.logo}
      alt=""
      width={size}
      height={size}
      className="sc-protoimg"
      onError={() => setFailed(true)}
    />
  );
}
/* Vault icon: the deposited asset as the main circle with the vault
   provider (DeFindex/Upshift) as a smaller circle badge, bottom-right —
   same language as the navbar wallet mark. */
function VaultIcon({
  asset,
  provider,
  size = 28,
}: {
  asset: string;
  provider: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const meta = (
    PROTO_META as Record<string, { label: string; logo: string | null }>
  )[provider];
  const sub = Math.max(12, Math.round(size * 0.48));
  return (
    <span className="sc-vault" style={{ width: size, height: size }}>
      {" "}
      <TokenIcon symbol={asset} size={size} />{" "}
      {meta?.logo && !failed ? (
        <img loading="lazy"
          className="sc-vault-sub"
          src={meta.logo}
          alt={meta.label}
          width={sub}
          height={sub}
          style={{ width: sub, height: sub }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="sc-vault-sub sc-vault-fb"
          aria-hidden="true"
          style={{
            width: sub,
            height: sub,
            fontSize: Math.max(7, Math.round(sub * 0.45)),
          }}
        >
          {provider.slice(0, 1).toUpperCase()}
        </span>
      )}{" "}
    </span>
  );
}
/* Market icon: vaults show asset + provider badge, everything else the
   protocol mark. */
function MarketIcon({ m, size = 22 }: { m: Market; size?: number }) {
  if (m.id.startsWith("vault|")) {
    return <VaultIcon asset={m.asset} provider={m.protocol} size={size} />;
  }
  return <CanvasProtoIcon id={m.protocol} size={size} />;
}

function fmtCompactUsd(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function fmtUsd(v: number): string {
  return `$${Math.round(v).toLocaleString()}`;
}

function numOnly(v: string) {
  const clean = v.replace(/[^0-9.]/g, "");
  const dot = clean.indexOf(".");
  const num =
    dot === -1
      ? clean
      : clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, "");
  return num.replace(/^0+(?=\d)/, "");
}

function readWallet(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem("seidar.wallet");
    return raw ? (JSON.parse(raw) as string) : null;
  } catch {
    return null;
  }
}

/* Collision-proof ids: module counters reset on every hot-reload while
   canvas state persists, which duplicated n1/e1 and collapsed lookups. */
function uid(prefix: string): string {
  try {
    return `${prefix}${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  }
}

export function StrategyCanvas() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [deposit, setDeposit] = useState("10000");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [feedState, setFeedState] = useState<"loading" | "live" | "error">("loading");
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [proto, setProto] = useState<"all" | ProtoId>("all");
  const [kind, setKind] = useState<"all" | "lending" | "yield">("all");
  const [sort, setSort] = useState<"apy" | "tvl">("apy");
  const [q, setQ] = useState("");
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [intent, setIntent] = useState<unknown>(null);
  const [intentOpen, setIntentOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedTick, setSavedTick] = useState<number | null>(null);
  /* Attached action subnode: which node's ordered actions are configured. */
  const [configNode, setConfigNode] = useState<string | null>(null);
  /* Per-action modal: token + amount editor for one NodeActionItem.
     Draft lives here so Cancel never touches the node. */
  const [editing, setEditing] = useState<null | {
    nodeId: string;
    actionId: string;
    asset: string;
    amount: string;
  }>(null);
  /* Kind picker for the "add action" row inside the config card. */
  const [addKind, setAddKind] = useState<NodeAction | null>(null);
  /* Drag-reorder for ordered actions: id of the action being dragged. */
  const [dragAction, setDragAction] = useState<string | null>(null);
  /* Drop target + insertion side while dragging (drives the gap shift). */
  const [dragOver, setDragOver] = useState<null | { id: string; after: boolean }>(null);
  /* Custom dropdowns (native <select> can't render token logos). */
  const [kindOpen, setKindOpen] = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);
  /* Sidebar filter dropdowns (single-value, custom caret). */
  const [fTypeOpen, setFTypeOpen] = useState(false);
  const [fSortOpen, setFSortOpen] = useState(false);
  /* Handle arm: set by clicking a node's + circle, completed by clicking
     an opposite-side + circle (output → input only, never same-side).
     Body clicks never create edges — only handles do. */
  const [handleArm, setHandleArm] = useState<null | { node: string; side: "in" | "out" }>(null);
  /* Transient toast timer for create/loop feedback (no permanent bar). */
  const toastTimer = useRef<number>(0);
  useEffect(() => {
    if (!createError) return;
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setCreateError(null), 6000);
    return () => window.clearTimeout(toastTimer.current);
  }, [createError]);
  const drag = useRef<
    | { mode: "pan"; sx: number; sy: number; px: number; py: number }
    | { mode: "node"; id: string; dx: number; dy: number; sx: number; sy: number }
    | null
  >(null);
  const moved = useRef(false);
  const edgesRef = useRef<FlowEdge[]>([]);
  edgesRef.current = edges;
  const selRef = useRef<{ node: string | null }>({ node: null });
  selRef.current = { node: selNode };
  const selEdgeRef = useRef<string | null>(null);
  selEdgeRef.current = selEdge;
  /* Undo/redo stacks: immutable snapshots, structural edits always kept,
     position-only drags coalesced to one frame per ~800ms. */
  type Snap = { nodes: CanvasNode[]; edges: FlowEdge[] };
  const histPast = useRef<Snap[]>([]);
  const histFuture = useRef<Snap[]>([]);
  const histLock = useRef(false);
  const histMeta = useRef({ t: 0, nn: -1, ne: -1, na: -1 });
  const canvasRef = useRef<HTMLDivElement>(null);
  /* Live mirrors for native listeners (wheel, sidebar drop) that can't
     resubscribe on every render. */
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  /* Zoom target for the eased pinch wheel: gestures accumulate on the
     target while the rendered scale glides toward it each frame. */
  const targetRef = useRef(scale);
  const panRef = useRef(pan);
  panRef.current = pan;
  /* Pan commits are throttled to one state update per frame — wheel and
     pointer gestures fire far more often, and every commit re-renders the
     whole canvas. The ref stays live so hit-testing never lags. */
  const panRaf = useRef(0);
  function schedulePan() {
    if (panRaf.current) return;
    panRaf.current = requestAnimationFrame(() => {
      panRaf.current = 0;
      setPan({ ...panRef.current });
    });
  }
  useEffect(() => () => cancelAnimationFrame(panRaf.current), []);
  const nodesRef = useRef(nodes);
  // During an active node drag the ref carries live positions (committed to
  // state at most once per frame); otherwise it mirrors state. Never let a
  // foreign re-render wipe uncommitted drag positions.
  if (drag.current?.mode !== "node") nodesRef.current = nodes;
  /* Node-drag commits, throttled like pan: pointermove fires far faster
     than frames, and every commit re-renders the canvas + recomputes the
     flow engine. */
  const nodeRaf = useRef(0);
  function scheduleNodeCommit() {
    if (nodeRaf.current) return;
    nodeRaf.current = requestAnimationFrame(() => {
      nodeRaf.current = 0;
      setNodes([...nodesRef.current]);
    });
  }
  /* Viewport size, smooth-recenter flag, drop highlight + drag ghost. */
  const [view, setView] = useState({ w: 0, h: 0 });
  const [smooth, setSmooth] = useState(false);
  const [dropOver, setDropOver] = useState<string | null>(null);
  const [ghost, setGhost] = useState<null | {
    market: Market;
    x: number;
    y: number;
    ox: number;
    oy: number;
    back: boolean;
  }>(null);
  const rowDragRef = useRef<null | {
    marketId: string;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    active: boolean;
  }>(null);
  const addMarketRef = useRef<
    (marketId: string, opts?: { from?: string | null; at?: { x: number; y: number } }) => string | null
  >(() => null);

  /* Live markets: lending rows + earn vaults, normalized once. */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [p, v] = await Promise.all([
          apiFetch("/api/pools", { cache: "no-store" }).then((r) => r.json()),
          apiFetch("/api/vaults?limit=100", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        // Same pool+asset can repeat (e.g. XOXNO spokes share a hub): dedupe
        // by id keeping the best supply APY so list keys stay unique.
        const seen = new Map<string, Market>();
        const put = (m: Market) => {
          const cur = seen.get(m.id);
          if (!cur || (m.apy ?? -1) > (cur.apy ?? -1)) seen.set(m.id, m);
        };
        // Lending pools group ALL their assets into one sidebar row (whole
        // pool, not per currency): "YieldBlox", never "YieldBlox PYUSD".
        // Nodes pick their asset from the pool on the card.
        type PoolGroup = {
          protocol: string;
          pool: string;
          poolName: string;
          tvl: number | null;
          assets: {
            code: string;
            supplyApy: number | null;
            borrowApy: number | null;
            ltvPct: number | null;
            canBorrow: boolean;
          }[];
        };
        const groups = new Map<string, PoolGroup>();
        const tvlOf = (pool: string): number | null => {
          const hit = (
            p as { rows?: { pool?: unknown; poolSupplied?: unknown }[] }
          )?.rows?.find((r) => String(r?.pool ?? "") === pool);
          const tvl = Number(hit?.poolSupplied);
          return Number.isFinite(tvl) ? tvl : null;
        };
        const addAsset = (
          protocol: string,
          pool: string,
          poolName: string,
          code: string,
          supplyApy: number | null,
          borrowApy: number | null,
          ltvPct: number | null,
          canBorrow: boolean,
        ) => {
          let g = groups.get(pool);
          if (!g) {
            g = { protocol, pool, poolName, tvl: tvlOf(pool), assets: [] };
            groups.set(pool, g);
          }
          if (!g.assets.some((a) => a.code === code)) {
            g.assets.push({ code, supplyApy, borrowApy, ltvPct, canBorrow });
          } else {
            const cur = g.assets.find((a) => a.code === code)!;
            if ((supplyApy ?? -1) > (cur.supplyApy ?? -1)) cur.supplyApy = supplyApy;
            if ((borrowApy ?? -1) > (cur.borrowApy ?? -1)) cur.borrowApy = borrowApy;
            if (cur.ltvPct == null && ltvPct != null) cur.ltvPct = ltvPct;
            cur.canBorrow = cur.canBorrow || canBorrow;
          }
        };
        const pAssets = Array.isArray(
          (p as { assets?: unknown })?.assets,
        )
          ? ((p as { assets?: unknown }).assets as {
              protocol?: unknown;
              pool?: unknown;
              poolName?: unknown;
              code?: unknown;
              supplyApy?: unknown;
              borrowApy?: unknown;
              ltvPct?: unknown;
              canCollateral?: unknown;
              canBorrow?: unknown;
            }[])
          : [];
        if (pAssets.length > 0) {
          for (const a of pAssets) {
            const protocol = String(a?.protocol ?? "");
            if (protocol !== "blend" && protocol !== "xoxno") continue;
            const code = String(a?.code ?? "").toUpperCase();
            if (!code) continue;
            const apy = Number(a?.supplyApy);
            const bapy = Number(a?.borrowApy);
            const ltv = Number(a?.ltvPct);
            addAsset(
              protocol,
              String(a.pool),
              String((a as { poolName?: unknown })?.poolName ?? "Pool"),
              code,
              Number.isFinite(apy) ? apy : null,
              Number.isFinite(bapy) ? bapy : null,
              Number.isFinite(ltv) ? ltv : null,
              a?.canBorrow !== false,
            );
          }
        } else if (p?.ok && Array.isArray(p.rows)) {
          for (const r of p.rows as {
            protocol?: unknown;
            pool?: unknown;
            poolName?: unknown;
            collateral?: unknown;
            debt?: unknown;
            supplyApy?: unknown;
            marketSizeUsd?: unknown;
            available?: unknown;
          }[]) {
            if (r?.available === false) continue;
            const protocol = String(r?.protocol ?? "");
            if (protocol !== "blend" && protocol !== "xoxno") continue;
            // Supply legs only — borrow pairs can't take a deposit split.
            if (r?.debt != null) continue;
            const code = String(r?.collateral ?? "").toUpperCase();
            if (!code) continue;
            const apy = Number(r?.supplyApy);
            addAsset(
              protocol,
              String(r.pool),
              String(r?.poolName ?? "Pool"),
              code,
              Number.isFinite(apy) ? apy : null,
              null,
              null,
              true,
            );
          }
        }
        for (const g of groups.values()) {
          if (g.assets.length === 0) continue;
          const ordered = [...g.assets].sort(
            (a, b) => (b.supplyApy ?? -1) - (a.supplyApy ?? -1),
          );
          const best = ordered[0];
          const n = g.assets.length;
          put({
            id: `pool|${g.pool}`,
            protocol: g.protocol as ProtoId,
            kind: "lending",
            name: g.poolName,
            sub: `${PROTO_META[g.protocol as ProtoId].label} · Lending · ${n} asset${n === 1 ? "" : "s"}`,
            asset: best.code,
            assets: ordered,
            apy: best.supplyApy,
            borrowApy: best.borrowApy,
            tvl: g.tvl,
          });
        }
        if (v?.ok && Array.isArray(v.rows)) {
          for (const r of v.rows as {
            protocol?: unknown;
            address?: unknown;
            name?: unknown;
            assetCode?: unknown;
            apyPct?: unknown;
            tvlUsd?: unknown;
          }[]) {
            const protocol = String(r?.protocol ?? "");
            if (protocol !== "defindex" && protocol !== "upshift") continue;
            const code = String(r?.assetCode ?? "").toUpperCase();
            if (!code) continue;
            const apy = Number(r?.apyPct);
            const tvl = Number(r?.tvlUsd);
            put({
              id: `vault|${String(r?.address ?? r?.name ?? code)}`,
              protocol: protocol as ProtoId,
              kind: "yield",
              name: String(r?.name ?? code),
              sub: `${PROTO_META[protocol as ProtoId].label} · Yield · ${code}`,
              asset: code,
              assets: [
                {
                  code,
                  supplyApy: Number.isFinite(apy) ? apy : null,
                  borrowApy: null,
                  ltvPct: null,
                  canBorrow: false,
                },
              ],
              apy: Number.isFinite(apy) ? apy : null,
              borrowApy: null,
              tvl: Number.isFinite(tvl) ? tvl : null,
            });
          }
        }
        setMarkets([...seen.values()]);
        setFeedState("live");
        void ensurePrices([...seen.values()].flatMap((m) => [m.asset, ...m.assets.map((a) => a.code)]));
      } catch {
        if (!cancelled) setFeedState("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => new Map(markets.map((m) => [m.id, m])), [markets]);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  /* Live mirror of the flow engine for event handlers (drop, chaining)
     that can't resubscribe on every render. */
  const flowsRef = useRef<Map<string, NodeFlow> | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toUpperCase();
    const rows = markets.filter(
      (m) =>
        (proto === "all" || m.protocol === proto) &&
        (kind === "all" || m.kind === kind) &&
        (!needle ||
          m.name.toUpperCase().includes(needle) ||
          m.asset.includes(needle) ||
          m.assets.some((a) => a.code.includes(needle))),
    );
    const val = (m: Market) => (sort === "apy" ? m.apy : m.tvl);
    return [...rows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    });
  }, [markets, proto, kind, sort, q]);

  /* Token registry for sizing compile legs in exact base units. */
  const [swapTokens, setSwapTokens] = useState<{ code: string; contract: string; decimals: number }[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/swap/tokens", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.ok && Array.isArray(d.tokens)) setSwapTokens(d.tokens);
      })
      .catch(() => {
        /* swaps stay unquotable until the registry loads */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const tokenOf = (code: string) =>
    swapTokens.find((t) => t.code.toUpperCase() === code.toUpperCase()) ?? null;

  /* Slot for a chained child: fanned like the root's tidy grid — first
     child lands up-right on a diagonal (never a flat stub), siblings
     cascade with card-clearance spacing so nothing piles up. */
  function childSlot(fromId: string | null): { x: number; y: number } {
    if (fromId && fromId !== "source") {
      const parent = nodesRef.current.find((x) => x.id === fromId);
      const sibs = edgesRef.current.filter((e) => e.from === fromId).length;
      if (parent) {
        return {
          x: Math.round(parent.x + NODE_W + 80),
          y: Math.round(parent.y - 120 + sibs * 300),
        };
      }
    }
    // Root kids: tidy grid (the arrangement the + button is known for).
    const kids = edgesRef.current.filter((e) => e.from === "source").length;
    const col = Math.floor(kids / 3);
    const row = kids % 3;
    return { x: 360 + col * 300, y: 40 + row * 250 };
  }
  /* Equal-share: every pct edge out of `fromId` splits 100% evenly.
     Fixed/entire legs are manual — they opt out of auto-sharing. */
  function equalizeEdges(list: FlowEdge[], fromId: string): FlowEdge[] {
    const outs = list.filter((e) => e.from === fromId && e.mode === "pct");
    if (outs.length === 0) return list;
    if (list.some((e) => e.from === fromId && e.mode !== "pct")) return list;
    const each = Math.floor(100 / outs.length);
    const ids = new Set(outs.map((e) => e.id));
    let assigned = 0;
    return list.map((e) => {
      if (!ids.has(e.id)) return e;
      const isLast = e.id === outs[outs.length - 1].id;
      const pct = isLast ? 100 - assigned : each;
      assigned += pct;
      return { ...e, pct };
    });
  }
  /* Add a market as a node. When a node is selected (or `from` is
     passed, e.g. from a sidebar drop), the new node chains onto it —
     selection follows the target so chains extend naturally. New
     connections auto-share 100% equally; manual edits via the linkbar
     stick afterwards. */
  function addMarket(
    marketId: string,
    opts?: { from?: string | null; at?: { x: number; y: number } },
  ): string | null {
    const market = byId.get(marketId);
    if (!market) return null;
    // Adding/dropping a node dismisses the attached subnode.
    setConfigNode(null);
    // One market per source: a node (deposit included) never feeds two
    // nodes of the same pool — reconnect the existing node instead, which
    // pools every inflow sent its way.
    const nodeId = uid("n");
    const from = opts?.from !== undefined ? opts.from : selNode;
    // Fresh nodes have no out-edges, so from→new can't loop; the
    // reaches() check is belt-and-braces alongside the dupe guard.
    const list = edgesRef.current;
    // Same-market dupe guard (mirrors handleClicked): the node is still
    // created, but it stays unconnected instead of doubling a feed.
    const dupMarket =
      from != null &&
      list.some(
        (e) =>
          e.from === from &&
          nodesRef.current.find((n) => n.id === e.to)?.marketId ===
            market.id,
      );
    const chain =
      from &&
      !list.some((e) => e.from === from && e.to === nodeId) &&
      !reaches(nodeId, from, list) &&
      !dupMarket
        ? from
        : null;
    const mName = byIdRef.current.get(market.id)?.name ?? "that market";
    let note: string | null = null;
    if (dupMarket && from) {
      note = `${freshName(from)} already feeds ${mName} — created unconnected.`;
    } else if (chain == null) {
      // Fresh nodes auto-feed from the deposit — unless it already feeds
      // the same market (one market per source, deposit included).
      const srcDup = list.some(
        (e) =>
          e.from === "source" &&
          nodesRef.current.find((n) => n.id === e.to)?.marketId ===
            market.id,
      );
      if (srcDup) note = `Deposit already feeds ${mName} — created unconnected.`;
    }
    const slot = opts?.at ? { x: Math.round(opts.at.x), y: Math.round(opts.at.y) } : childSlot(chain);
    // Prefill: a fresh lending/yield node supplies 100% of its projected
    // inflow (resolved to tokens at live prices; empty until priced — the
    // coming %-stored amounts will make this exact permanently).
    const pxNow = pricesRef.current[market.asset] ?? null;
    const effPoolForPrefill =
      chain === "source" || chain == null
        ? depNum
        : (flows.get(chain)?.available ?? 0);
    const sibPctOuts = list.filter((e) => {
      const src = chain && chain !== "source" ? chain : "source";
      return e.from === src && e.mode === "pct";
    });
    const sibManual = list.some((e) => {
      const src = chain && chain !== "source" ? chain : "source";
      return e.from === src && e.mode !== "pct";
    });
    const projectedIn =
      sibManual || effPoolForPrefill <= 0
        ? 0
        : effPoolForPrefill / (sibPctOuts.length + 1);
    const prefillTokens =
      pxNow != null && pxNow > 0 && projectedIn > 0.01
        ? String(Math.floor((projectedIn / pxNow) * 1e6) / 1e6)
        : "";
    void ensurePrices([market.asset]);
    setNodes((prev) => {
      const first = DEFAULT_ACTION[market.kind];
      return [
        ...prev,
        {
          id: nodeId,
          marketId,
          x: slot.x,
          y: slot.y,
          actions: [{ id: uid("a"), kind: first, asset: market.asset, amount: prefillTokens }],
        },
      ];
    });
    // Chaining is always honored: the requested edge is created even when
    // the source is dry — the newcomer simply starves (darkened + locked)
    // until funding lands. Only loop/dupe guards (above) refuse.
    const feedFromSource = chain == null && note == null;
    setEdges((prev) => {
      let next = [...prev];
      if (chain) {
        // Chained nodes feed from their parent only — no deposit split.
        if (!next.some((e) => e.from === chain && e.to === nodeId)) {
          next.push({ id: uid("e"), from: chain, to: nodeId, pct: 0, mode: "pct", amount: 0 });
          next = equalizeEdges(next, chain);
        }
      } else if (feedFromSource && !next.some((e) => e.to === nodeId)) {
        next.push({ id: uid("e"), from: "source", to: nodeId, pct: 0, mode: "pct", amount: 0 });
        next = equalizeEdges(next, "source");
      }
      return next;
    });
    // Selection always follows the newcomer so chains extend with +.
    setSelNode(nodeId);
    setCreateError(note);
    return nodeId;
  }
  addMarketRef.current = addMarket;

  /* Ordered-action editors: every mutation keeps action order stable and
     preserves the node's money flow (USD in → actions → out). */
  function updateAction(nodeId: string, actionId: string, patch: Partial<NodeActionItem>) {
    setNodes((prev) =>
      prev.map((n) =>
        n.id !== nodeId
          ? n
          : { ...n, actions: n.actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a)) },
      ),
    );
  }
  function removeAction(nodeId: string, actionId: string) {
    setNodes((prev) =>
      prev.map((n) =>
        n.id !== nodeId ? n : { ...n, actions: n.actions.filter((a) => a.id !== actionId) },
      ),
    );
  }
  function moveAction(nodeId: string, actionId: string, dir: -1 | 1) {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId) return n;
        const ix = n.actions.findIndex((a) => a.id === actionId);
        const jx = ix + dir;
        if (ix < 0 || jx < 0 || jx >= n.actions.length) return n;
        const next = [...n.actions];
        const [item] = next.splice(ix, 1);
        next.splice(jx, 0, item);
        return { ...n, actions: next };
      }),
    );
  }
  /* Drag-reorder: drop the dragged action before/after the target slot,
     so the list visibly shifts as you hover. */
  function reorderAction(nodeId: string, dragId: string, targetId: string, after = false) {
    if (dragId === targetId) return;
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId) return n;
        const from = n.actions.findIndex((a) => a.id === dragId);
        const to = n.actions.findIndex((a) => a.id === targetId);
        if (from < 0 || to < 0) return n;
        const next = [...n.actions];
        const [item] = next.splice(from, 1);
        let at = next.findIndex((a) => a.id === targetId);
        if (at < 0) at = next.length;
        else if (after) at += 1;
        next.splice(at, 0, item);
        return { ...n, actions: next };
      }),
    );
  }
  function addAction(nodeId: string, kind: NodeAction) {
    const n = nodesRef.current.find((x) => x.id === nodeId);
    const market = n ? byIdRef.current.get(n.marketId) : null;
    if (!n || !market) return;
    const allowed = ACTIONS_FOR[market.kind];
    if (!allowed.includes(kind)) return;
    const item: NodeActionItem = {
      id: uid("a"),
      kind,
      asset: market.asset,
      amount: "",
    };
    setNodes((prev) =>
      prev.map((x) => (x.id === nodeId ? { ...x, actions: [...x.actions, item] } : x)),
    );
    void ensurePrices([item.asset]);
    // Open the new action straight in the token+amount modal.
    setEditing({ nodeId, actionId: item.id, asset: item.asset, amount: "" });
  }
  function removeNode(nodeId: string) {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.from !== nodeId && e.to !== nodeId));
    setSelNode((cur) => (cur === nodeId ? null : cur));
    setConfigNode((cur) => (cur === nodeId ? null : cur));
  }

  function removeEdge(id: string) {
    setEdges((prev) => prev.filter((e) => e.id !== id));
    setSelEdge((cur) => (cur === id ? null : cur));
  }

  function splitEvenly() {
    const ids = nodes.map((n) => n.id);
    if (ids.length === 0) return;
    const each = Math.floor(100 / ids.length);
    setEdges((prev) => {
      const next = prev.filter(
        (e) => e.from !== "source" || ids.includes(e.to),
      );
      ids.forEach((id, i) => {
        const pct =
          i === ids.length - 1 ? 100 - each * (ids.length - 1) : each;
        const ix = next.findIndex((e) => e.from === "source" && e.to === id);
        if (ix >= 0) next[ix] = { ...next[ix], pct, mode: "pct" as const };
        else next.push({ id: uid("e"), from: "source", to: id, pct, mode: "pct" as const, amount: 0 });
      });
      return next;
    });
  }

  /** True when `to` is already reachable from `from` (that edge would loop). */
  function reaches(from: string, to: string, list: FlowEdge[]): boolean {
    const seen = new Set<string>();
    const stack = [from];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur === to) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const e of list) if (e.from === cur) stack.push(e.to);
    }
    return false;
  }
  /** One existing route from `from` to `to` (for naming loop blocks). */
  function findPath(from: string, to: string, list: FlowEdge[]): string[] | null {
    const prev = new Map<string, string | null>([[from, null]]);
    const queue = [from];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === to) {
        const path = [cur];
        let p: string | null | undefined = prev.get(cur);
        while (p != null) {
          path.unshift(p);
          p = prev.get(p);
        }
        return path;
      }
      for (const e of list) {
        if (e.from === cur && !prev.has(e.to)) {
          prev.set(e.to, cur);
          queue.push(e.to);
        }
      }
    }
    return null;
  }
  /** Fresh-ref name lookup for window-listener closures (never stale). */
  function freshName(id: string): string {
    if (id === "source") return "Deposit";
    const n = nodesRef.current.find((x) => x.id === id);
    if (!n) return "Market";
    return byIdRef.current.get(n.marketId)?.name ?? "Market";
  }

  /* Pointer drag: nodes move, empty canvas pans. */
  /* Body clicks only ever move selection — edges are created exclusively
     by clicking two opposite-side + handles (see handleClicked), so
     inspecting nodes mid-build can't trip validations. */
  function nodeClicked(id: string) {
    const sel = selRef.current.node;
    setSelEdge(null);
    // Body clicks dismiss the attached action subnode (only the caret
    // chip reopens it, possibly on another node).
    setConfigNode(null);
    if (sel == null) {
      setSelNode(id);
      return;
    }
    if (sel === id) {
      setSelNode(null);
      return;
    }
    setSelNode(id);
  }
  /* + handle clicked: first click arms {node, side}; a second click on an
     opposite-side handle of another node connects output → input (click
     order free). Same-side re-arms; same-node toggles off. Deleting a node
     removes only that node (its edges go with it) — neighbors stay put. */
  /* Layer of a node: longest path from the deposit source (source = 0,
     unconnected = 0). Columns are topological, never positional — dragging
     never changes them, only connections do. */
  function colOf(id: string, list: FlowEdge[]): number {
    if (id === "source") return 0;
    const memo = new Map<string, number>();
    const visiting = new Set<string>();
    function depth(x: string): number {
      if (x === "source") return 0;
      if (memo.has(x)) return memo.get(x)!;
      if (visiting.has(x)) return 0;
      visiting.add(x);
      const ins = list.filter((e) => e.to === x);
      let d = 0;
      if (ins.length > 0) {
        d = 1 + Math.max(...ins.map((e) => depth(e.from)));
      }
      visiting.delete(x);
      memo.set(x, d);
      return d;
    }
    return depth(id);
  }
  function handleClicked(id: string, side: "in" | "out") {
    setSelEdge(null);
    if (id !== "source") setSelNode(id);
    if (!handleArm) {
      setHandleArm({ node: id, side });
      return;
    }
    if (handleArm.node === id) {
      setHandleArm(handleArm.side === side ? null : { node: id, side });
      return;
    }
    if (handleArm.side === side) {
      setHandleArm({ node: id, side });
      return;
    }
    const from = handleArm.side === "out" ? handleArm.node : id;
    const to = handleArm.side === "out" ? id : handleArm.node;
    const list = edgesRef.current;
    if (list.some((e) => e.from === from && e.to === to)) {
      setHandleArm({ node: to, side: "out" });
      return;
    }
    if (reaches(to, from, list)) {
      const path = findPath(to, from, list);
      const names = path ? path.map((p) => freshName(p)).join(" → ") : null;
      setCreateError(
        names
          ? `Loop blocked — ${names} already flows. Pick another + or Esc to stop.`
          : "That would loop — chain blocked.",
      );
      setHandleArm({ node: to, side: "out" });
      return;
    }
    // One market per source: A cannot feed two nodes of the same pool.
    // Reconnecting the existing node instead pools every inflow there.
    const toNode = nodesRef.current.find((n) => n.id === to) ?? null;
    const toMid = toNode?.marketId ?? null;
    if (
      toMid &&
      list.some(
        (e) =>
          e.from === from &&
          e.to !== to &&
          nodesRef.current.find((n) => n.id === e.to)?.marketId === toMid,
      )
    ) {
      const mName = byIdRef.current.get(toMid)?.name ?? "that market";
      setCreateError(
        `${freshName(from)} already feeds ${mName} — fund the existing node instead of doubling it.`,
      );
      setHandleArm({ node: to, side: "out" });
      return;
    }
    // Layers flow one step at a time: col n feeds col n+1 (or a node with
    // no connections yet, which adopts the next layer). No skipping, no
    // going back — that keeps fund movement a clean hierarchy.
    const cF = colOf(from, list);
    const cT = colOf(to, list);
    const tFed = list.some((e) => e.to === to);
    if (tFed && cT !== cF + 1) {
      setCreateError(
        `Layers flow one step at a time — ${freshName(from)} sits in layer ${cF}, so it can only feed layer ${cF + 1} (or a node with no connections yet).`,
      );
      setHandleArm({ node: to, side: "out" });
      return;
    }
    setEdges((prev) =>
      equalizeEdges(
        [...prev, { id: uid("e"), from, to, pct: 0, mode: "pct" as const, amount: 0 }],
        from,
      ),
    );
    // Stay armed on the target's output for fast forward-chaining.
    // (Targets always carry an output handle — only the source lacks one,
    // and edges never point into the source.)
    setHandleArm({ node: to, side: "out" });
    setCreateError(null);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic events carry no active pointer */
    }
    moved.current = false;
    drag.current = { mode: "pan", sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
  }
  function onNodeDown(e: React.PointerEvent<HTMLDivElement>, id: string) {
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic events carry no active pointer */
    }
    // Dragging another node dismisses the attached subnode; the dragged
    // node's own subnode (if any) keeps following it.
    setConfigNode((cur) => (cur != null && cur !== id ? null : cur));
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    moved.current = false;
    drag.current = {
      mode: "node",
      id,
      dx: node.x - e.clientX / scale,
      dy: node.y - e.clientY / scale,
      sx: e.clientX,
      sy: e.clientY,
    };
  }
  useEffect(() => {
    function move(e: PointerEvent) {
      const d = drag.current;
      if (!d) return;
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) moved.current = true;
      if (d.mode === "pan") {
        panRef.current = { x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) };
        schedulePan();
      } else {
        // Free movement both ways (only a far guardrail against runaways).
        const x = Math.max(-10000, e.clientX / scale + d.dx);
        const y = Math.max(-10000, e.clientY / scale + d.dy);
        nodesRef.current = nodesRef.current.map((n) =>
          n.id === d.id ? { ...n, x, y } : n,
        );
        scheduleNodeCommit();
      }
    }
    function up() {
      const d = drag.current;
      drag.current = null;
      // Flush any throttled positions so the drop lands exactly where shown.
      if (d?.mode === "node" && nodeRaf.current) {
        cancelAnimationFrame(nodeRaf.current);
        nodeRaf.current = 0;
        setNodes([...nodesRef.current]);
      }
      if (!moved.current && d) {
        if (d.mode === "node") nodeClicked(d.id);
        else {
          setSelNode(null);
          setSelEdge(null);
          setHandleArm(null);
          setConfigNode(null);
        }
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      cancelAnimationFrame(nodeRaf.current);
    };
    // nodeClicked reads refs + stable setters, so no dep needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inField = (e.target as HTMLElement | null)?.closest?.(
        "input, textarea, select, [contenteditable]",
      );
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y")) {
        if (inField || document.querySelector(".sc-overlay")) return;
        e.preventDefault();
        if (e.key === "y" || e.key === "Y" || e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        if (inField || document.querySelector(".sc-overlay")) return;
        const sn = selRef.current.node;
        const se = selEdgeRef.current;
        if (sn) {
          e.preventDefault();
          removeNode(sn);
          return;
        }
        if (se) {
          e.preventDefault();
          removeEdge(se);
          return;
        }
      }
      if (e.key !== "Escape") return;
      if (document.querySelector(".sc-overlay")) return;
      setSelNode(null);
      setSelEdge(null);
      setHandleArm(null);
      setConfigNode(null);
      setEditing(null);
      setKindOpen(false);
      setAssetOpen(false);
      setFTypeOpen(false);
      setFSortOpen(false);
      setDragAction(null);
      setDragOver(null);
      rowDragRef.current = null;
      setGhost(null);
      setDropOver(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // undo/redo/removeNode/removeEdge are stable hoisted declarations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Node hit-testing in client coords (sidebar drops + drop hover).
     NODE_H approximates the tallest market card. */
  const NODE_H = 280;
  function nodeAt(clientX: number, clientY: number): string | null {
    const el = canvasRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const s = scaleRef.current;
    const p = panRef.current;
    const wx = (clientX - rect.left - p.x) / s;
    const wy = (clientY - rect.top - p.y) / s;
    if (wx >= SX - 12 && wx <= SX + NODE_W + 12 && wy >= SY - 12 && wy <= SY + 232)
      return "source";
    for (const n of nodesRef.current) {
      if (
        wx >= n.x - 10 &&
        wx <= n.x + NODE_W + 10 &&
        wy >= n.y - 10 &&
        wy <= n.y + NODE_H + 10
      )
        return n.id;
    }
    return null;
  }

  /* Wheel: plain scroll pans the canvas (vertical + horizontal); only a
     pinch / ctrl+wheel expand-contract gesture zooms, anchored on the
     cursor. Zoom is proportional to the gesture size (tiny trackpad ticks
     nudge, full wheel notches step ~11%) and eased toward a target so
     motion is smooth instead of jumping fixed steps. Native listener so
     the browser page-zoom never fires. */
  const MIN_Z = 0.4;
  const MAX_Z = 1.8;
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const clampZ = (v: number) => Math.max(MIN_Z, Math.min(MAX_Z, v));
    let raf = 0;
    const anchor = { x: 0, y: 0 };
    function applyZoom(ns: number, mx: number, my: number) {
      const s = scaleRef.current;
      const c = clampZ(ns);
      if (c === s) return;
      const k = c / s;
      const p = panRef.current;
      const np = { x: mx - (mx - p.x) * k, y: my - (my - p.y) * k };
      panRef.current = np;
      setPan(np);
      scaleRef.current = c;
      setScale(c);
    }
    function frame() {
      const s = scaleRef.current;
      const t = targetRef.current;
      if (Math.abs(t - s) < 0.0005) {
        if (s !== t) applyZoom(t, anchor.x, anchor.y);
        raf = 0;
        return;
      }
      applyZoom(s + (t - s) * 0.4, anchor.x, anchor.y);
      raf = requestAnimationFrame(frame);
    }
    function onW(e: WheelEvent) {
      /* Let the right-side config card + modals scroll natively: a wheel
         over .sc-config/.sc-modal must not pan/zoom the canvas underneath. */
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".sc-config, .sc-modal, .sc-config-list")) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey) {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        anchor.x = e.clientX - rect.left;
        anchor.y = e.clientY - rect.top;
        const dy = Math.max(-150, Math.min(150, e.deltaY * unit));
        targetRef.current = clampZ(targetRef.current * Math.exp(-dy * 0.0069));
        if (!raf) raf = requestAnimationFrame(frame);
      } else {
        const p = panRef.current;
        panRef.current = { x: p.x - e.deltaX * unit, y: p.y - e.deltaY * unit };
        schedulePan();
      }
    }
    el.addEventListener("wheel", onW, { passive: false });
    return () => {
      el.removeEventListener("wheel", onW);
      cancelAnimationFrame(raf);
    };
  }, []);

  /* Viewport size for the out-of-view check. */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setView({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Sidebar drag: rows glide on a ghost chip; dropping on a node adds the
     market chained to it, missing snaps smoothly back to the row. */
  function onRowDown(e: React.PointerEvent<HTMLDivElement>, marketId: string) {
    if ((e.target as HTMLElement).closest("button")) return;
    rowDragRef.current = {
      marketId,
      sx: e.clientX,
      sy: e.clientY,
      ox: e.clientX,
      oy: e.clientY,
      active: false,
    };
  }
  useEffect(() => {
    function move(e: PointerEvent) {
      const r = rowDragRef.current;
      if (!r) return;
      if (!r.active) {
        if (Math.hypot(e.clientX - r.sx, e.clientY - r.sy) <= 7) return;
        r.active = true;
        setConfigNode(null);
      }
      const m = byIdRef.current.get(r.marketId);
      if (!m) return;
      setGhost({ market: m, x: e.clientX, y: e.clientY, ox: r.ox, oy: r.oy, back: false });
      setDropOver(nodeAt(e.clientX, e.clientY));
    }
    function up(e: PointerEvent) {
      const r = rowDragRef.current;
      rowDragRef.current = null;
      if (!r || !r.active) return;
      const target = nodeAt(e.clientX, e.clientY);
      const m = byIdRef.current.get(r.marketId);
      setDropOver(null);
      if (!m) {
        setGhost(null);
        return;
      }
      if (target) {
        // Dropped on a node/source: chain with the root's tidy arrangement
        // (same slot logic as the + button), not the raw cursor point.
        addMarketRef.current(r.marketId, {
          from: target === "source" ? null : target,
        });
        setGhost(null);
      } else {
        // Missed every node: glide back to the row, then release. The
        // ghost is already painted at the drop point from the drag moves,
        // so one update to the origin (with .back on) transitions home.
        setGhost({ market: m, x: r.ox, y: r.oy, ox: r.ox, oy: r.oy, back: true });
        setTimeout(() => setGhost(null), 320);
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  const depNum = Number(deposit) || 0;
  /* Live USD prices for compile sizing (missing prices block rather
     than guessing). */
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const pricesRef = useRef<Record<string, number | null>>({});
  async function ensurePrices(codes: string[]) {
    const miss = [...new Set(codes.map((c) => c.toUpperCase()))].filter(
      (c) => !(pricesRef.current[c] != null && (pricesRef.current[c] as number) > 0),
    );
    if (miss.length === 0) return;
    try {
      const d = await apiFetch(`/api/prices?codes=${encodeURIComponent(miss.join(","))}`, {
        cache: "no-store",
      }).then((r) => r.json());
      const next = { ...pricesRef.current };
      for (const c of miss) {
        const px = Number(d?.prices?.[c]);
        if (px > 0) next[c] = px;
      }
      pricesRef.current = next;
      setPrices(next);
    } catch {
      /* legs stay estimated until prices load */
    }
  }
  /* Money flow v3: every node runs its ordered actions against the money
     that arrived. Supply/deposit consume configured token amounts,
     borrow/withdraw produce funds, repay consumes to off-canvas debt.
     Out-edges allocate from what's left. Memoized and cycle-guarded so
     funds are never double-counted. Amounts are token units, converted
     through live prices — unpriced legs block with an error, never guess. */
  interface ActionFlow {
    item: NodeActionItem;
    supplyApy: number | null;
    borrowApy: number | null;
    /** Configured USD value (0 when unset or unpriced). */
    usd: number;
    configured: boolean;
    /** USD actually consumed from / produced into the node's money. */
    consumed: number;
    produced: number;
    /** USD short of a full fill (consuming actions only). */
    shortfall: number;
  }
  interface NodeFlow {
    inflow: number;
    available: number;
    out: number;
    kept: number;
    supply: number;
    withdrawn: number;
    borrowed: number;
    repaid: number;
    produced: number;
    actions: ActionFlow[];
  }
  const ZERO_FLOW: NodeFlow = {
    inflow: 0,
    available: 0,
    out: 0,
    kept: 0,
    supply: 0,
    withdrawn: 0,
    borrowed: 0,
    repaid: 0,
    produced: 0,
    actions: [],
  };
  const flows = useMemo(() => {
    const inMemo = new Map<string, number>();
    const flowMemo = new Map<string, NodeFlow>();
    const nodeOf = (id: string) => (id === "source" ? null : nodes.find((x) => x.id === id));
    const apyOf = (node: CanvasNode, asset: string): { supplyApy: number | null; borrowApy: number | null } => {
      const market = byId.get(node.marketId);
      const info = market?.assets.find((a) => a.code === asset) ?? null;
      return {
        supplyApy: info?.supplyApy ?? market?.apy ?? null,
        borrowApy: info?.borrowApy ?? market?.borrowApy ?? null,
      };
    };
    function contrib(e: FlowEdge, visiting: Set<string>): number {
      const pool = e.from === "source" ? depNum : flowOf(e.from, visiting).available;
      if (e.mode === "fixed") return Math.max(0, e.amount);
      if (e.mode === "entire") {
        const others = edges
          .filter((o) => o.from === e.from && o.id !== e.id)
          .reduce(
            (a, o) =>
              a +
              (o.mode === "pct"
                ? (pool * o.pct) / 100
                : o.mode === "fixed"
                  ? Math.max(0, o.amount)
                  : 0),
            0,
          );
        return Math.max(0, pool - others);
      }
      return (pool * e.pct) / 100;
    }
    function inflowOf(id: string, visiting: Set<string>): number {
      if (id === "source") return depNum;
      if (inMemo.has(id)) return inMemo.get(id)!;
      if (visiting.has(id)) return 0;
      visiting.add(id);
      let sum = 0;
      for (const e of edges) if (e.to === id) sum += contrib(e, visiting);
      visiting.delete(id);
      inMemo.set(id, sum);
      return sum;
    }
    function flowOf(id: string, visiting: Set<string>): NodeFlow {
      if (id === "source") {
        return {
          ...ZERO_FLOW,
          inflow: depNum,
          available: depNum,
          kept: depNum,
        };
      }
      if (flowMemo.has(id)) return flowMemo.get(id)!;
      if (visiting.has(id)) return ZERO_FLOW;
      // No visiting.add(id) here: inflowOf guards itself, and pre-adding
      // would make it see id in the set and return 0 — every node stuck
      // at In $0 / Avail $0 no matter what its connections send.
      const n = nodeOf(id);
      if (!n) {
        return ZERO_FLOW;
      }
      let available = inflowOf(id, visiting);
      const inflow = available;
      let supplied = 0;
      let withdrawn = 0;
      let borrowed = 0;
      let repaid = 0;
      let produced = 0;
      const actions: ActionFlow[] = [];
      for (const a of n.actions) {
        const px = prices[a.asset] ?? null;
        const tokens = a.amount.trim() === "" ? NaN : Number(a.amount);
        const priced = px != null && px > 0;
        const configured =
          a.asset !== "" && Number.isFinite(tokens) && tokens > 0 && priced;
        const usd = configured ? (tokens as number) * (px as number) : 0;
        const apys = apyOf(n, a.asset);
        const af: ActionFlow = {
          item: a,
          supplyApy: apys.supplyApy,
          borrowApy: apys.borrowApy,
          usd,
          configured,
          consumed: 0,
          produced: 0,
          shortfall: 0,
        };
        if (!configured) {
          actions.push(af);
          continue;
        }
        if (a.kind === "supply" || a.kind === "deposit") {
          const take = Math.min(usd, available);
          af.consumed = take;
          af.shortfall = Math.max(0, usd - available);
          available -= take;
          supplied += take;
        } else if (a.kind === "borrow" || a.kind === "withdraw") {
          available += usd;
          produced += usd;
          af.produced = usd;
          if (a.kind === "borrow") borrowed += usd;
          else withdrawn += usd;
        } else if (a.kind === "repay") {
          const take = Math.min(usd, available);
          af.consumed = take;
          af.shortfall = Math.max(0, usd - available);
          available -= take;
          repaid += take;
        }
        actions.push(af);
      }
      // Publish before measuring out-edges: out-edge contribs read this
      // node's pool via flowOf(id) — the memo hit below stops what would
      // otherwise recompute this frame forever (stack overflow on any
      // chained node, surfacing as $0/stale flows downstream).
      const flow: NodeFlow = {
        inflow,
        available,
        out: 0,
        kept: available,
        supply: supplied,
        withdrawn,
        borrowed,
        repaid,
        produced,
        actions,
      };
      flowMemo.set(id, flow);
      const out = edges
        .filter((e) => e.from === id)
        .reduce((a, e) => a + contrib(e, new Set()), 0);
      flow.out = out;
      flow.kept = Math.max(0, available - out);
      return flow;
    }
    const m = new Map<string, NodeFlow>();
    for (const n of nodes) m.set(n.id, flowOf(n.id, new Set()));
    return m;
  }, [nodes, edges, depNum, prices, byId]);
  flowsRef.current = flows;
  /* History recorder: snapshots every committed graph state for undo/redo.
     Runs after every render commit that changed nodes/edges. */
  useEffect(() => {
    if (histLock.current) {
      histLock.current = false;
      return;
    }
    const na = nodes.reduce((a, n) => a + n.actions.length, 0);
    const structural =
      nodes.length !== histMeta.current.nn ||
      edges.length !== histMeta.current.ne ||
      na !== histMeta.current.na;
    const now = Date.now();
    if (!structural && now - histMeta.current.t < 800) return;
    histPast.current.push({ nodes, edges });
    if (histPast.current.length > 100) histPast.current.shift();
    histMeta.current = { t: now, nn: nodes.length, ne: edges.length, na };
    histFuture.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);
  function undo() {
    if (histPast.current.length < 2) return;
    const cur = histPast.current.pop()!;
    histFuture.current.push(cur);
    const prev = histPast.current[histPast.current.length - 1];
    histLock.current = true;
    histMeta.current = {
      t: Date.now(),
      nn: prev.nodes.length,
      ne: prev.edges.length,
      na: prev.nodes.reduce((a, n) => a + n.actions.length, 0),
    };
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setSelNode(null);
    setSelEdge(null);
    setConfigNode(null);
  }
  function redo() {
    const next = histFuture.current.pop();
    if (!next) return;
    histLock.current = true;
    histPast.current.push(next);
    histMeta.current = {
      t: Date.now(),
      nn: next.nodes.length,
      ne: next.edges.length,
      na: next.nodes.reduce((a, n) => a + n.actions.length, 0),
    };
    setNodes(next.nodes);
    setEdges(next.edges);
    setSelNode(null);
    setSelEdge(null);
    setConfigNode(null);
  }
  /* Retro-prefill: a pristine single supply/deposit action (empty amount,
     as created while starved) fills to 100% of In the moment funding lands
     and a live price exists — one shot, never touches user edits. */
  useEffect(() => {
    const fills: { nodeId: string; actionId: string; amount: string }[] = [];
    for (const n of nodes) {
      if (n.actions.length !== 1) continue;
      const a = n.actions[0];
      if (a.amount.trim() !== "") continue;
      if (a.kind !== "supply" && a.kind !== "deposit") continue;
      const inflow = flows.get(n.id)?.inflow ?? 0;
      if (inflow <= DUST_USD) continue;
      const px = prices[a.asset] ?? null;
      if (px == null || px <= 0) continue;
      fills.push({
        nodeId: n.id,
        actionId: a.id,
        amount: String(Math.floor((inflow / px) * 1e6) / 1e6),
      });
    }
    if (fills.length === 0) return;
    setNodes((prev) =>
      prev.map((n) => {
        const fill = fills.find((f) => f.nodeId === n.id);
        if (!fill) return n;
        return {
          ...n,
          actions: n.actions.map((x) =>
            x.id === fill.actionId && x.amount.trim() === ""
              ? { ...x, amount: fill.amount }
              : x,
          ),
        };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flows]);
  const legs = useMemo(
    () =>
      nodes
        .map((n) => {
          const market = byId.get(n.marketId) ?? null;
          if (!market) return { node: n, market: null };
          return { node: n, market };
        })
        .filter((l) => l.market != null),
    [nodes, byId],
  );
  type Leg = (typeof legs)[number];
  const srcTotal = edges
    .filter((e) => e.from === "source")
    .reduce((a, e) => a + e.pct, 0);
  /* Graph validation: blocking errors for create/simulate + honest metrics.
     Warnings (estimated data) never block. */
  const graphErrors = useMemo(() => {
    const errs: string[] = [];
    const byFrom = new Map<string, FlowEdge[]>();
    for (const e of edges) {
      const l = byFrom.get(e.from) ?? [];
      l.push(e);
      byFrom.set(e.from, l);
    }
    for (const [from, list] of byFrom) {
      const who = from === "source" ? "Deposit" : nodeName(from);
      const pool = flows.get(from)?.available ?? (from === "source" ? depNum : 0);
      if (list.filter((e) => e.mode === "pct").reduce((a, e) => a + e.pct, 0) > 100) {
        errs.push(`${who}: allocations exceed 100% of its pool.`);
      }
      if (list.filter((e) => e.mode === "entire").length > 1) {
        errs.push(`${who}: only one connection can take the entire remainder.`);
      }
      for (const e of list) {
        if (e.mode === "fixed") {
          if (!(e.amount > 0)) errs.push(`${who} → ${nodeName(e.to)}: set a fixed amount.`);
          else if (e.amount > pool + 1e-9)
            errs.push(
              `${who} → ${nodeName(e.to)}: $${Math.round(e.amount).toLocaleString()} exceeds the $${Math.round(pool).toLocaleString()} available.`,
            );
        }
      }
    }
    for (const l of legs) {
      const m = l.market!;
      const f = flows.get(l.node.id);
      if (!f) continue;
      const nm = m.name;
      if (l.node.actions.length === 0) {
        errs.push(`${nm}: add an action.`);
        continue;
      }
      for (const af of f.actions) {
        const label = ACTION_LABEL[af.item.kind];
        const tokens = af.item.amount.trim() === "" ? NaN : Number(af.item.amount);
        if (af.item.asset === "" || !(Number.isFinite(tokens) && tokens > 0)) {
          errs.push(`${nm}: ${label} is not configured.`);
        } else if (af.usd <= 0) {
          errs.push(`${nm}: ${label} — price unavailable for ${af.item.asset}.`);
        } else if (af.shortfall > 1e-9) {
          errs.push(
            `${nm}: ${label} needs ${fmtUsd(af.shortfall)} more than available.`,
          );
        }
      }
      // Closed-system books: same-asset withdraw coverage, borrow needs
      // collateral, repay within debt, debt within borrow power.
      errs.push(...creditErrors(nm, m, f.actions));
    }
    // Connections are always honored (loop/dupe guards aside): a dry source
    // simply starves its subtree — darkened + locked until funded — so no
    // receive-only gating lives here anymore.
    return errs;
    // nodeName/flows stable per render; legs carry nodes+markets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, legs, flows, prices, depNum]);
  /* Non-blocking cautions: borrow past 90% of power. Shown amber, never
     gates Create — the >100% case above already blocks. */
  const graphWarnings = useMemo(() => {
    const warns: string[] = [];
    for (const l of legs) {
      const f = flows.get(l.node.id);
      if (!f) continue;
      const books = nodeBooks(l.market, f.actions);
      if (books.power > DUST_USD && books.debt > books.power * 0.9 && books.debt <= books.power + 1e-9) {
        warns.push(
          `${l.market!.name}: borrow at ${Math.round((books.debt / books.power) * 100)}% of power — liquidation risk past 90%.`,
        );
      }
    }
    return warns;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legs, flows]);
  /* Per-node issue flags for inline card errors (same checks as the
     global list, keyed for display). */
  /* Per-node issue flags for inline card errors (same checks as the
     global list, keyed for display). */
  const nodeIssues = useMemo(() => {
    const m = new Map<string, string[]>();
    const push = (id: string, s: string) => {
      const l = m.get(id) ?? [];
      l.push(s);
      m.set(id, l);
    };
    for (const l of legs) {
      const f = flows.get(l.node.id);
      if (!f) continue;
      if (l.node.actions.length === 0) {
        push(l.node.id, "Add an action to this node.");
        continue;
      }
      for (const af of f.actions) {
        const label = ACTION_LABEL[af.item.kind];
        const tokens = af.item.amount.trim() === "" ? NaN : Number(af.item.amount);
        if (af.item.asset === "" || !(Number.isFinite(tokens) && tokens > 0)) {
          push(l.node.id, `${label} is not configured.`);
        } else if (af.usd <= 0) {
          push(l.node.id, `${label}: price unavailable for ${af.item.asset}.`);
        } else if (af.shortfall > 1e-9) {
          push(l.node.id, `${label} needs ${fmtUsd(af.shortfall)} more.`);
        }
      }
    }
    // Fixed legs beyond their source pool + double entire-takes.
    const byFrom = new Map<string, FlowEdge[]>();
    for (const e of edges) {
      const arr = byFrom.get(e.from) ?? [];
      arr.push(e);
      byFrom.set(e.from, arr);
    }
    for (const [from, list] of byFrom) {
      const pool = from === "source" ? depNum : flows.get(from)?.available ?? 0;
      if (list.filter((e) => e.mode === "entire").length > 1) {
        for (const e of list.filter((e) => e.mode === "entire")) push(e.to, "Only one connection can take the remainder.");
      }
      for (const e of list) {
        if (e.mode === "fixed" && e.amount > pool + 1e-9) {
          push(e.to, `Needs ${fmtUsd(e.amount)} — source has ${fmtUsd(pool)}.`);
        }
      }
      if (from !== "source" && list.length > 0) {
        const n = nodes.find((x) => x.id === from);
        if (!n || !n.actions.some((a) => a.kind === "withdraw" || a.kind === "borrow")) {
          push(from, "Can only receive — add Withdraw or Borrow to send.");
        }
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, legs, flows, prices, depNum]);
  const unknownApy = legs.some((l) => {
    const f = flows.get(l.node.id);
    if (!f) return false;
    for (const af of f.actions) {
      if (
        (af.item.kind === "supply" || af.item.kind === "deposit") &&
        af.consumed > 0.01 &&
        af.supplyApy == null
      ) {
        return true;
      }
      if (af.item.kind === "borrow" && af.produced > 0.01 && af.borrowApy == null) {
        return true;
      }
    }
    return false;
  });
  /* Metrics from actual configuration: borrowed funds are debt, never yield.
     earn = supply-side yield, cost = borrow-side cost, net on the deposit. */
  let grossSupply = 0;
  let totalBorrowed = 0;
  let earnY = 0;
  let costY = 0;
  for (const l of legs) {
    const f = flows.get(l.node.id);
    if (!f) continue;
    for (const af of f.actions) {
      if (
        (af.item.kind === "supply" || af.item.kind === "deposit") &&
        af.consumed > 0.01
      ) {
        grossSupply += af.consumed;
        if (af.supplyApy != null) earnY += (af.consumed * af.supplyApy) / 100;
      }
      if (af.item.kind === "borrow" && af.produced > 0.01) {
        totalBorrowed += af.produced;
        if (af.borrowApy != null) costY += (af.produced * af.borrowApy) / 100;
      }
    }
  }
  const netApy = depNum > 0 ? ((earnY - costY) / depNum) * 100 : 0;
  const projected = depNum > 0 ? (depNum * netApy) / 100 : 0;
  const riskLevel = totalBorrowed > 0.01 ? "Medium" : "Low";
  const riskTitle =
    totalBorrowed > 0.01
      ? "Borrow legs carry liquidation risk"
      : "Supply-only strategies carry no liquidation risk";
  const ready = nodes.length > 0;
  const overAlloc = srcTotal > 100;
  const srcFunded =
    srcTotal > 0 ||
    edges.some(
      (e) =>
        e.from === "source" &&
        (e.mode === "entire" || (e.mode === "fixed" && e.amount > 0)),
    );
  const canCreate = ready && srcFunded && !overAlloc && depNum > 0;
  const srcFixedUsd = edges
    .filter((e) => e.from === "source" && e.mode === "fixed")
    .reduce((a, e) => a + Math.max(0, e.amount), 0);
  const srcHasEntire = edges.some((e) => e.from === "source" && e.mode === "entire");

  async function compile() {
    setCreateError(null);
    setCopied(false);
    try {
      if (graphErrors.length > 0) throw new Error(graphErrors[0]);
      const active = legs.filter((l) => {
        const f = flows.get(l.node.id);
        if (!f) return false;
        return f.actions.some(
          (af) => af.configured && (af.consumed > 0.01 || af.produced > 0.01),
        );
      });
      if (active.length === 0)
        throw new Error("No market keeps any supply — raise some splits.");
      if (!(depNum > 0)) throw new Error("Enter a deposit above 0.");
      if (overAlloc)
        throw new Error("Over-allocated — deposit splits exceed 100%.");
      // Execution order follows the money: walk edges out from the deposit
      // source so every leg runs after its funding. Unreachable legs append.
      const order: typeof active = [];
      const seen = new Set<string>();
      const visit = (id: string): void => {
        if (id !== "source" && !seen.has(id)) {
          seen.add(id);
          const leg = active.find((l) => l.node.id === id);
          if (leg) order.push(leg);
        }
        for (const e of edges) if (e.from === id) visit(e.to);
      };
      visit("source");
      for (const l of active) {
        if (seen.has(l.node.id)) continue;
        seen.add(l.node.id);
        order.push(l);
      }
      const codes = [
        ...new Set(
          order.flatMap((l) => {
            const f = flows.get(l.node.id);
            if (!f) return [];
            return f.actions.filter((af) => af.configured).map((af) => af.item.asset);
          }),
        ),
      ];
      // Pre-flight: every configured asset needs a live price, otherwise
      // USD metrics downstream would be fiction.
      if (codes.length > 0) {
        const d = await apiFetch(
          `/api/prices?codes=${encodeURIComponent(codes.join(","))}`,
          { cache: "no-store" },
        ).then((r) => r.json());
        const live: Record<string, number | null> = d?.prices ?? {};
        for (const code of codes) {
          const px = live[code.toUpperCase()];
          if (!(typeof px === "number" && px > 0))
            throw new Error(`No live price for ${code} — can't size that leg.`);
        }
      }
      const stroopsOfTokens = (tokens: number, code: string): number => {
        const dec = tokenOf(code)?.decimals ?? 7;
        const s = Math.round(tokens * 10 ** dec);
        if (!(s > 0))
          throw new Error(`${code} leg rounds to zero — raise the amount.`);
        return s;
      };
      const recipe = new Recipe();
      const earn: {
        vault: string;
        name: string;
        side: "deposit" | "withdraw";
        asset: string;
        amountUsd: number;
        stroops: number;
      }[] = [];
      for (const l of order) {
        const m = l.market!;
        const f = flows.get(l.node.id);
        if (!f) continue;
        for (const af of f.actions) {
          if (!af.configured) continue;
          const code = af.item.asset;
          const tokens = Number(af.item.amount);
          if (af.item.kind === "supply" && m.kind === "lending") {
            if (af.consumed <= 0.01) continue;
            recipe.supply(code, stroopsOfTokens(tokens, code));
          } else if (af.item.kind === "withdraw" && m.kind === "lending") {
            if (af.produced <= 0.01) continue;
            recipe.withdraw(code, stroopsOfTokens(tokens, code));
          } else if (af.item.kind === "deposit" || af.item.kind === "withdraw") {
            // Vault legs settle through Earn (DeFindex/Upshift), not the
            // lending executor — listed explicitly, never miscompiled.
            const vault = l.node.marketId.startsWith("vault|")
              ? l.node.marketId.slice("vault|".length).split("|")[0]
              : l.node.marketId;
            const amt = af.item.kind === "withdraw" ? af.produced : af.consumed;
            if (amt <= 0.01) continue;
            earn.push({
              vault,
              name: m.name,
              side: af.item.kind === "withdraw" ? "withdraw" : "deposit",
              asset: code,
              amountUsd: Math.round(amt * 100) / 100,
              stroops: stroopsOfTokens(tokens, code),
            });
          } else if (af.item.kind === "borrow") {
            if (af.produced <= 0.01) continue;
            recipe.borrow(code, stroopsOfTokens(tokens, code));
          } else if (af.item.kind === "repay") {
            if (af.consumed <= 0.01) continue;
            recipe.repay(code, stroopsOfTokens(tokens, code));
          }
        }
      }
      let actions: unknown[] = [];
      try {
        actions = recipe.buildIntent(readWallet() ?? PLACEHOLDER).actions;
      } catch (e) {
        // Lending-empty but earn legs exist: the executor has nothing to do,
        // the Earn section below still stands on its own.
        if (earn.length === 0) throw e;
        actions = [];
      }
      setIntent({
        user: readWallet() ?? PLACEHOLDER,
        createdAt: new Date().toISOString(),
        actions,
        earn,
      });
      setIntentOpen(true);
    } catch (e) {
      setCreateError(String(e instanceof Error ? e.message : e).slice(0, 200));
    }
  }

  function save() {
    try {
      const raw = window.localStorage.getItem("seidar.canvas");
      const arr = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(arr) ? arr : [];
      list.push({
        id: `canvas-${Date.now()}`,
        name: name.trim() || "Untitled strategy",
        deposit: deposit,
        nodes: nodes.map((n) => ({
          marketId: n.marketId,
          x: Math.round(n.x),
          y: Math.round(n.y),
          actions: n.actions.map((a) => ({
            id: a.id,
            kind: a.kind,
            asset: a.asset,
            amount: a.amount,
          })),
        })),
        edges: edges.map((e) => ({ from: e.from, to: e.to, pct: e.pct, mode: e.mode, amount: e.amount })),
        savedAt: new Date().toISOString(),
      });
      window.localStorage.setItem("seidar.canvas", JSON.stringify(list.slice(-20)));
      setSavedTick(Date.now());
      setTimeout(() => setSavedTick(null), 1500);
    } catch {
      /* ignore */
    }
  }

  const SX = 48;
  const SY = 300;
  const byNode = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  /* Out-of-view detection: when every node has left the viewport, offer
     a glide back to content. */
  const contentBox = useMemo(() => {
    let minX = SX;
    let minY = SY;
    let maxX = SX + NODE_W;
    let maxY = SY + 232;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W);
      maxY = Math.max(maxY, n.y + NODE_H);
    }
    return { minX, minY, maxX, maxY };
  }, [nodes]);
  const outOfView = useMemo(() => {
    if (nodes.length === 0 || view.w === 0) return false;
    const x1 = contentBox.minX * scale + pan.x;
    const y1 = contentBox.minY * scale + pan.y;
    const x2 = contentBox.maxX * scale + pan.x;
    const y2 = contentBox.maxY * scale + pan.y;
    return x2 < 0 || y2 < 0 || x1 > view.w || y1 > view.h;
  }, [nodes, contentBox, view, scale, pan]);
  function recenter() {
    const cx = (contentBox.minX + contentBox.maxX) / 2;
    const cy = (contentBox.minY + contentBox.maxY) / 2;
    const W = view.w || 800;
    const H = view.h || 600;
    setSmooth(true);
    const np = { x: W / 2 - cx * scale, y: Math.max(16, H / 2 - cy * scale) };
    panRef.current = np;
    setPan(np);
    setTimeout(() => setSmooth(false), 360);
  }

  function nodeName(id: string): string {
    if (id === "source") return "Deposit";
    // NOTE: called from render-order-sensitive memos — only reads state
    // declared above the flow engine (nodes/byId), never byNode.
    const n = nodes.find((x) => x.id === id);
    if (!n) return "Market";
    return byId.get(n.marketId)?.name ?? "Market";
  }

  /** Live LTV % for one reserve asset (pool feed, else board fallback). */
  function ltvFor(market: Market | null | undefined, code: string): number {
    const live = market?.assets.find((a) => a.code === code)?.ltvPct;
    if (live != null) return live;
    return code === "USDC" || code === "EURC" ? 90 : 70;
  }
  /**
   * Closed-system books for one node: per-asset supplied balances walked in
   * order, USD-netted in-node debt, and borrow power from remaining
   * collateral × live LTV. Lending and yield share it (deposit counts as
   * supplied, vault withdrawals draw it down).
   */
  function nodeBooks(
    market: Market | null,
    actions: ActionFlow[],
  ): {
    sup: Map<string, number>;
    debt: number;
    power: number;
    lines: { code: string; usd: number; ltv: number }[];
  } {
    const sup = new Map<string, number>();
    let debt = 0;
    for (const af of actions) {
      if (!af.configured) continue;
      const code = af.item.asset;
      if (af.item.kind === "supply" || af.item.kind === "deposit") {
        sup.set(code, (sup.get(code) ?? 0) + af.consumed);
      } else if (af.item.kind === "withdraw") {
        sup.set(code, Math.max(0, (sup.get(code) ?? 0) - af.produced));
      } else if (af.item.kind === "borrow") {
        debt += af.produced;
      } else if (af.item.kind === "repay") {
        debt = Math.max(0, debt - af.consumed);
      }
    }
    let power = 0;
    const lines: { code: string; usd: number; ltv: number }[] = [];
    for (const [code, usd] of sup) {
      if (usd <= DUST_USD) continue;
      const ltv = ltvFor(market, code);
      power += (usd * ltv) / 100;
      lines.push({ code, usd, ltv });
    }
    return { sup, debt, power, lines };
  }
  /**
   * Closed-system validation for one node (blocking): same-asset withdraw
   * coverage, borrow-needs-collateral, repay-within-debt, debt-within-power.
   * The >90%-of-power caution is a warning, reported separately.
   */
  function creditErrors(
    nm: string,
    market: Market | null,
    actions: ActionFlow[],
  ): string[] {
    const errs: string[] = [];
    const sup = new Map<string, number>();
    let debt = 0;
    for (const af of actions) {
      if (!af.configured) continue;
      const code = af.item.asset;
      if (af.item.kind === "supply" || af.item.kind === "deposit") {
        sup.set(code, (sup.get(code) ?? 0) + af.consumed);
      } else if (af.item.kind === "withdraw") {
        const have = sup.get(code) ?? 0;
        if (af.produced > have + 1e-9) {
          errs.push(`${nm}: Withdraw ${code} exceeds the ${fmtUsd(have)} supplied in this pool.`);
        }
        sup.set(code, Math.max(0, have - af.produced));
      } else if (af.item.kind === "borrow") {
        const coll = [...sup.values()].reduce((a, v) => a + v, 0);
        if (coll <= DUST_USD) {
          errs.push(`${nm}: Borrow needs collateral — supply in this pool first.`);
        }
        debt += af.produced;
      } else if (af.item.kind === "repay") {
        if (af.consumed > debt + 1e-9) {
          errs.push(`${nm}: Repay exceeds the ${fmtUsd(debt)} borrowed in this pool.`);
        }
        debt = Math.max(0, debt - af.consumed);
      }
    }
    let power = 0;
    for (const [code, usd] of sup) power += (usd * ltvFor(market, code)) / 100;
    if (debt > power + 1e-9 && debt > DUST_USD) {
      errs.push(
        `${nm}: borrow exceeds ${fmtUsd(power)} of borrow power — add collateral or lower it.`,
      );
    }
    return errs;
  }

  /** Displayed USD value of one connection under the current model. */
  function edgeValue(e: FlowEdge): number {
    const pool = e.from === "source" ? depNum : flows.get(e.from)?.available ?? 0;
    if (e.mode === "fixed") return Math.max(0, e.amount);
    if (e.mode === "entire") {
      const others = edges
        .filter((o) => o.from === e.from && o.id !== e.id)
        .reduce(
          (a, o) =>
            a +
            (o.mode === "pct"
              ? (pool * o.pct) / 100
              : o.mode === "fixed"
                ? Math.max(0, o.amount)
                : 0),
          0,
        );
      return Math.max(0, pool - others);
    }
    return (pool * e.pct) / 100;
  }

  /** Allocation editor writer: manual pct shares the remainder equally
      across the other pct siblings (change reflects to all others);
      fixed takes a USD amount, entire takes the remainder. */
  function setEdgeAlloc(id: string, mode: AllocMode, value: number) {
    setEdges((prev) => {
      const target = prev.find((e) => e.id === id);
      if (!target) return prev;
      if (mode === "fixed") {
        return prev.map((e) =>
          e.id !== id ? e : { ...e, mode, pct: 0, amount: Math.max(0, Math.round(value)) },
        );
      }
      if (mode === "entire") {
        return prev.map((e) => (e.id !== id ? e : { ...e, mode, pct: 0, amount: 0 }));
      }
      const sibs = prev.filter((o) => o.from === target.from && o.id !== id);
      const allPct = sibs.every((o) => o.mode === "pct");
      const mine = Math.max(0, Math.min(100, Math.round(value)));
      if (!allPct || sibs.length === 0) {
        const others = sibs
          .filter((o) => o.mode === "pct")
          .reduce((a, o) => a + o.pct, 0);
        return prev.map((e) =>
          e.id !== id
            ? e
            : { ...e, mode, amount: 0, pct: Math.max(0, Math.min(100, mine, 100 - others)) },
        );
      }
      // Split the remainder equally among the other pct legs.
      const rest = Math.max(0, 100 - mine);
      const each = Math.floor(rest / sibs.length);
      let assigned = 0;
      return prev.map((e) => {
        if (e.id === id) return { ...e, mode, amount: 0, pct: mine };
        const ix = sibs.findIndex((s) => s.id === e.id);
        if (ix < 0) return e;
        const isLast = ix === sibs.length - 1;
        const pct = isLast ? rest - assigned : each;
        assigned += pct;
        return { ...e, pct };
      });
    });
  }

  function renderLinkbar(): React.ReactNode {
    if (selEdge) {
      const e = edges.find((x) => x.id === selEdge);
      if (!e) return null;
      const cur = e.mode === "pct" ? e.pct : e.amount;
      const step = e.mode === "pct" ? 5 : 100;
      const pool = e.from === "source" ? depNum : flows.get(e.from)?.available ?? 0;
      const over = e.mode === "fixed" && e.amount > pool + 1e-9;
      return (
        <>
          <span>
            <b>{nodeName(e.from)}</b> → <b>{nodeName(e.to)}</b>
          </span>
          <div className="sc-seg" role="tablist" aria-label="Allocation mode">
            {(["pct", "fixed", "entire"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={e.mode === m}
                className={`sc-segbtn${e.mode === m ? " active" : ""}`}
                onClick={() => setEdgeAlloc(e.id, m, m === "pct" ? e.pct : e.amount)}
              >
                {m === "pct" ? "%" : m === "fixed" ? "$" : "All"}
              </button>
            ))}
          </div>
          {e.mode !== "entire" ? (
            <>
              <button
                type="button"
                aria-label="Lower connection share"
                onClick={() => setEdgeAlloc(e.id, e.mode, cur - step)}
              >
                −
              </button>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {e.mode === "fixed" && "$"}
                <input
                  value={String(cur)}
                  onChange={(ev) =>
                    setEdgeAlloc(e.id, e.mode, Number(numOnly(ev.target.value)) || 0)
                  }
                  inputMode="decimal"
                  aria-label={e.mode === "pct" ? "Percent share" : "Fixed USD amount"}
                  style={{ width: e.mode === "pct" ? 44 : 80 }}
                  onPointerDown={(ev) => ev.stopPropagation()}
                />
                {e.mode === "pct" && "%"}
              </span>
              <button
                type="button"
                aria-label="Raise connection share"
                onClick={() => setEdgeAlloc(e.id, e.mode, cur + step)}
              >
                +
              </button>
            </>
          ) : (
            <b title="Takes whatever is left after the other connections">All remaining</b>
          )}
          <span title={over ? "Exceeds the source pool — lower it or raise inflow" : "Computed flow"}>
            ≈ {fmtUsd(edgeValue(e))}
          </span>
          {over && <span className="sc-risk">insufficient</span>}
          <button
            type="button"
            className="danger"
            onClick={() => removeEdge(e.id)}
          >
            Remove
          </button>
        </>
      );
    }
    if (handleArm) {
      const src = handleArm.side === "out" ? handleArm.node : null;
      const dst = handleArm.side === "in" ? handleArm.node : null;
      return (
        <span>
          {src ? (
            <>
              Connecting <b>{nodeName(src)}</b> → click an input (+) · Esc to stop
            </>
          ) : (
            <>
              <b>{nodeName(dst!)}</b> takes input · click an output (+) to feed it · Esc to stop
            </>
          )}
        </span>
      );
    }
    if (selNode) {
      return (
        <span>
          <b>{nodeName(selNode)}</b> selected — click a + to connect · add or
          drop a market · Esc to clear
        </span>
      );
    }
    return null;
  }

  /* Sidebar panel, memoized: it lists up to 100 market rows and must NOT
     reconcile on every pan/zoom frame. Callbacks route through refs
     (addMarketRef) or ref-safe handlers (onRowDown) so the closure never
     goes stale. */
  const sidePanel = useMemo(
    () => (
      <div className="sc-panel">
        <p className="sc-cap">Protocol</p>
        <div className="sc-chips" role="group" aria-label="Protocol filter">
          {(["all", "blend", "xoxno", "defindex", "upshift"] as const).map(
            (p) => (
              <button
                key={p}
                type="button"
                className={`sc-chip${proto === p ? " active" : ""}`}
                onClick={() => setProto(p)}
              >
                {p !== "all" && <CanvasProtoIcon id={p} size={12} />}
                {p === "all"
                  ? "All"
                  : PROTO_META[p].label}
              </button>
            ),
          )}
        </div>
        <div className="sc-frow">
          <div className="sc-fld">
            <span className="sc-cap">Market type</span>
            <div className="sc-dd sc-fdd">
              <button
                type="button"
                className="sc-dd-btn sc-fbtn"
                aria-haspopup="listbox"
                aria-expanded={fTypeOpen}
                onClick={() => {
                  setFSortOpen(false);
                  setFTypeOpen((o) => !o);
                }}
              >
                <span>{kind === "all" ? "All" : kind === "lending" ? "Lending" : "Yield"}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {fTypeOpen && (
                <div className="sc-dd-list" role="listbox" aria-label="Market type">
                  {(["all", "lending", "yield"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="option"
                      aria-selected={kind === t}
                      className={`sc-dd-opt${kind === t ? " sel" : ""}`}
                      onClick={() => {
                        setKind(t);
                        setFTypeOpen(false);
                      }}
                    >
                      {t === "all" ? "All" : t === "lending" ? "Lending" : "Yield"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="sc-fld">
            <span className="sc-cap">Sort by</span>
            <div className="sc-dd sc-fdd">
              <button
                type="button"
                className="sc-dd-btn sc-fbtn"
                aria-haspopup="listbox"
                aria-expanded={fSortOpen}
                onClick={() => {
                  setFTypeOpen(false);
                  setFSortOpen((o) => !o);
                }}
              >
                <span>{sort === "apy" ? "APY" : "TVL"}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {fSortOpen && (
                <div className="sc-dd-list" role="listbox" aria-label="Sort markets">
                  {(["apy", "tvl"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="option"
                      aria-selected={sort === t}
                      className={`sc-dd-opt${sort === t ? " sel" : ""}`}
                      onClick={() => {
                        setSort(t);
                        setFSortOpen(false);
                      }}
                    >
                      {t === "apy" ? "APY" : "TVL"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <input
          className="sc-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search markets…"
          aria-label="Search markets"
        />
        <p className="sc-hint">Drag a market onto a node to chain it · + to add</p>
        <div className="sc-list" role="list">
          {feedState === "loading" && (
            <p className="sc-note sc-loading">
              <LoadingMark size={14} /> Loading live markets…
            </p>
          )}
          {feedState === "error" && (
            <p className="sc-note">Market feed unreachable — check connection.</p>
          )}
          {feedState === "live" &&
            filtered.slice(0, 100).map((m) => {
              // Pre-blocked: the effective source already feeds this market,
              // so adding it could never connect. Blurred, undraggable and
              // unclickable with the reason on hover — no dead dragging.
              const effSrc = selNode ?? "source";
              const fed = edges.some(
                (e) =>
                  e.from === effSrc &&
                  nodes.find((n) => n.id === e.to)?.marketId === m.id,
              );
              const fedName =
                effSrc === "source"
                  ? "Deposit"
                  : (byId.get(
                      nodes.find((n) => n.id === effSrc)?.marketId ?? "",
                    )?.name ?? "Selected node");
              return (
                <div
                  className={`sc-row${ghost?.market.id === m.id ? " dragging" : ""}${fed ? " blocked" : ""}`}
                  role="listitem"
                  key={m.id}
                  onPointerDown={fed ? undefined : (e) => onRowDown(e, m.id)}
                  title={
                    fed
                      ? `${fedName} already feeds ${m.name} — reconnect that node instead.`
                      : undefined
                  }
                >
                  <MarketIcon m={m} size={22} />
                  <span className="sc-row-main">
                    <b title={m.name}>{m.name}</b>
                    <small>{m.sub}</small>
                  </span>
                  <span className="sc-row-stats">
                    <b className={m.apy != null ? "pos" : ""}>
                      {m.apy != null ? `${m.apy.toFixed(2)}%` : "—"}
                    </b>
                    <small>
                      {m.tvl != null ? fmtCompactUsd(m.tvl) : "—"}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="sc-add"
                    disabled={fed}
                    onClick={() => addMarketRef.current(m.id)}
                    aria-label={`Add ${m.name}`}
                    title={
                      fed
                        ? `${fedName} already feeds ${m.name} — reconnect that node instead.`
                        : undefined
                    }
                  >
                    +
                  </button>
                </div>
              );
            })}
          {feedState === "live" && filtered.length === 0 && (
            <p className="sc-note">No markets match these filters.</p>
          )}
        </div>
        <p className="sc-count">
          {feedState === "live"
            ? `${filtered.length} market${filtered.length === 1 ? "" : "s"}`
            : "—"}
        </p>
      </div>
    ),
    [filtered, feedState, ghost, proto, kind, sort, q, fTypeOpen, fSortOpen, selNode, edges, nodes, byId],
  );

  return (
    <div className="sc-wrap">
      {/* Top bar */}
      <div className="sc-top">
        <button
          type="button"
          className="sc-back"
          onClick={() => router.push("/strategies")}
          aria-label="Back to Strategy"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <input
          className="sc-name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 60))}
          placeholder="Name your strategy"
          aria-label="Strategy name"
        />
        <span className="sc-pill" title="Seidar takes no fee on strategy execution">
          <i className="sc-dot sc-dot-fee" aria-hidden="true" /> Fee&nbsp;<b>0%</b>
        </span>
        {ready ? (
          <span className="sc-status ok">
            <i aria-hidden="true" /> Ready to create
          </span>
        ) : (
          <span className="sc-status wait">
            <i aria-hidden="true" /> Add a market to begin
          </span>
        )}
        <span className="sc-spacer" />
        <div className="sc-zoom" role="group" aria-label="Canvas zoom">
          <button type="button" onClick={() => { const ns = Math.max(0.5, Math.round((scaleRef.current - 0.1) * 10) / 10); targetRef.current = ns; setScale(ns); }} aria-label="Zoom out">−</button>
          <b>{Math.round(scale * 100)}%</b>
          <button type="button" onClick={() => { const ns = Math.min(1.6, Math.round((scaleRef.current + 0.1) * 10) / 10); targetRef.current = ns; setScale(ns); }} aria-label="Zoom in">+</button>
        </div>
        <button type="button" className="sc-btn" onClick={save}>
          {savedTick ? "Saved ✓" : "Save"}
        </button>
        <button
          type="button"
          className="sc-btn primary"
          disabled={!canCreate}
          onClick={compile}
          title={overAlloc ? "Over-allocated — deposit splits exceed 100%." : undefined}
        >
          Create strategy
        </button>
      </div>

      <div className="sc-main">
        {/* Canvas */}
        <div
          className="sc-canvas"
          ref={canvasRef}
          onPointerDown={onPointerDown}
          style={{ touchAction: "none" }}
        >
          <div
            className="sc-world"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transition: smooth ? "transform 0.32s ease" : undefined,
            }}
          >
            {/* Tiny viewport, overflow paints in world coords — a full-size
                svg would allocate a giant compositor layer and kill the tab. */}
            <svg className="sc-edges" width="10" height="10" aria-hidden="true">
              {edges.map((e) => {
                const from =
                  e.from === "source"
                    ? { x: SX + NODE_W, y: SY + 62 }
                    : byNode.get(e.from) != null
                      ? {
                          x: (byNode.get(e.from) as CanvasNode).x + NODE_W,
                          y: (byNode.get(e.from) as CanvasNode).y + 78,
                        }
                      : null;
                const tn = byNode.get(e.to);
                if (!from || !tn) return null;
                const x1 = from.x;
                const y1 = from.y;
                const x2 = tn.x;
                const y2 = tn.y + 78;
                // Dry-input alarm: the target already receives funds through
                // another line, but this one carries nothing yet — red dotted
                // flow so unfunded siblings are impossible to miss.
                const v = edgeValue(e);
                const ins = edges.filter((o) => o.to === e.to);
                const dryWarn =
                  ins.length >= 2 &&
                  ins.some((o) => o.id !== e.id && edgeValue(o) > DUST_USD) &&
                  v <= DUST_USD;
                return (
                  <g key={e.id}>
                    <path
                      d={`M ${x1} ${y1} C ${x1 + 80} ${y1}, ${x2 - 80} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={
                        selEdge === e.id
                          ? "#8b5cf6"
                          : dryWarn
                            ? "#e5484d"
                            : "#3a3a3a"
                      }
                      strokeWidth="1.6"
                      strokeDasharray={dryWarn ? "1.5 5" : undefined}
                      strokeLinecap={dryWarn ? "round" : undefined}
                      className={dryWarn ? "sc-edge-dry" : undefined}
                    />
                    <circle cx={x1} cy={y1} r="3" fill="#3a3a3a" />
                    <circle
                      cx={x2}
                      cy={y2}
                      r="3"
                      fill={dryWarn ? "#e5484d" : "#3a3a3a"}
                    />
                  </g>
                );
              })}
            </svg>
            {edges.map((e) => {
              const from =
                e.from === "source"
                  ? { x: SX + NODE_W, y: SY + 62 }
                  : byNode.get(e.from) != null
                    ? {
                        x: (byNode.get(e.from) as CanvasNode).x + NODE_W,
                        y: (byNode.get(e.from) as CanvasNode).y + 78,
                      }
                    : null;
              const tn = byNode.get(e.to);
              if (!from || !tn) return null;
              const x1 = from.x;
              const y1 = from.y;
              const x2 = tn.x;
              const y2 = tn.y + 78;
              return (
                <button
                  key={`pct-${e.id}`}
                  type="button"
                  className={`sc-split${selEdge === e.id ? " selected" : ""}`}
                  style={{
                    left: (x1 + x2) / 2,
                    top: (y1 + y2) / 2 - 8,
                  }}
                  title="Edit connection"
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={() => {
                    setSelEdge(e.id);
                    setSelNode(null);
                  }}
                >
                  {e.mode === "fixed"
                    ? `$${Math.round(e.amount).toLocaleString()}`
                    : e.mode === "entire"
                      ? "All"
                      : edgeValue(e) <= DUST_USD
                        ? "0%"
                        : `${e.pct}%`}
                </button>
              );
            })}
            {/* Deposit source */}
            <div
              className={`sc-node sc-source${dropOver === "source" ? " drop-hover" : ""}`}
              style={{ left: SX, top: SY, width: NODE_W }}
            >
              <div className="sc-node-head">
                <span className="sc-usd">$</span>
                <b>Deposit source</b>
              </div>
              <div className="sc-dep-row">
                <input
                  value={deposit}
                  onChange={(e) => setDeposit(numOnly(e.target.value))}
                  inputMode="decimal"
                  aria-label="Deposit amount in USDC"
                  onPointerDown={(e) => e.stopPropagation()}
                />
                <span className="sc-dep-asset">
                  <TokenIcon symbol="USDC" size={16} />
                  <em>USDC</em>
                </span>
              </div>
              <button
                type="button"
                className={`sc-handle out${handleArm?.node === "source" && handleArm.side === "out" ? " armed" : ""}`}
                aria-label="Output of Deposit source"
                title="Output — click, then an input (+) to connect"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClicked("source", "out");
                }}
              >
                +
              </button>
            </div>
            {nodes.length === 0 && (
              <div className="sc-empty" style={{ left: 360, top: SY - 20 }}>
                <span className="sc-empty-dot" aria-hidden="true" />
                <b>Add your first market</b>
                <span>Pick one from the panel →</span>
              </div>
            )}
            {/* Market nodes */}
            {legs.map((l) => {
              const m = l.market!;
              const flow = flows.get(l.node.id) ?? {
                inflow: 0,
                available: 0,
                out: 0,
                kept: 0,
                supply: 0,
                withdrawn: 0,
                borrowed: 0,
                repaid: 0,
                produced: 0,
                actions: [],
              };
              const starvedHere = (flows.get(l.node.id)?.inflow ?? 0) <= DUST_USD;
              const colHere = colOf(l.node.id, edges);
              const armInHere = handleArm?.node === l.node.id && handleArm.side === "in";
              const armOutHere = handleArm?.node === l.node.id && handleArm.side === "out";
              return (
                <div
                  key={l.node.id}
                  className={`sc-node${selNode === l.node.id ? " selected" : ""}${dropOver === l.node.id ? " drop-hover" : ""}${starvedHere ? " starved" : ""}`}
                  style={{ left: l.node.x, top: l.node.y, width: NODE_W }}
                  onPointerDown={(e) => onNodeDown(e, l.node.id)}
                >
                  <button
                    type="button"
                    className="sc-x"
                    aria-label={`Remove ${m.name}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNode(l.node.id);
                    }}
                  >
                    ×
                  </button>
                  <div className="sc-node-head">
                    <MarketIcon m={m} size={28} />
                    <span className="sc-node-title">
                      <b title={m.name}>{m.name}</b>
                      <small title={m.sub}>{m.sub}</small>
                    </span>
                    <span
                      className="sc-layer"
                      title={`Layer ${colHere} — feeds layer ${colHere + 1}`}
                    >
                      L{colHere}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="sc-actchip"
                    disabled={starvedHere}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelNode(l.node.id);
                      setSelEdge(null);
                      setConfigNode(l.node.id);
                    }}
                    aria-label={`Configure actions for ${m.name}`}
                    title={starvedHere ? "No inflow — fund this node to edit" : "Configure actions"}
                  >
                    <span>
                      {l.node.actions.length} action{l.node.actions.length === 1 ? "" : "s"}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                  <div className="sc-node-stats">
                    <span>
                      APY{" "}
                      <b className={m.apy != null ? "pos" : ""}>
                        {m.apy != null ? `${m.apy.toFixed(2)}%` : "—"}
                      </b>
                    </span>
                    <span>
                      TVL <b>{m.tvl != null ? fmtCompactUsd(m.tvl) : "—"}</b>
                    </span>
                  </div>
                      <div className="sc-kv">
                        <span>In</span>
                        <b>{fmtUsd(flow.inflow)}</b>
                      </div>
                      <div className="sc-kv">
                        <span>Collateral</span>
                        <b>{fmtUsd(Math.max(0, flow.supply - flow.withdrawn))}</b>
                      </div>
                      {Math.max(0, flow.borrowed - flow.repaid) > 0.01 && (
                        <div className="sc-kv">
                          <span>Borrowed</span>
                          <b>{fmtUsd(Math.max(0, flow.borrowed - flow.repaid))}</b>
                        </div>
                      )}
                  {/* Connection circles: input (left) + output (right), always
                      on. Click one, then an opposite-side circle, to connect
                      output → input. Deleting a node removes only that node. */}
                  <button
                    type="button"
                    className={`sc-handle in${armInHere ? " armed" : ""}`}
                    aria-label={`Input of ${m.name}`}
                    title="Input — click, then an output (+) to connect"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClicked(l.node.id, "in");
                    }}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className={`sc-handle out${armOutHere ? " armed" : ""}`}
                    aria-label={`Output of ${m.name}`}
                    title="Output — click, then an input (+) to connect"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClicked(l.node.id, "out");
                    }}
                  >
                    +
                  </button>
                </div>
              );
            })}
            {/* Attached action subnode: opens from the caret chip and rides
                with its node in world coords (not a fixed screen panel).
                Dismissed by body clicks, adds, drags and Esc. */}
            {(() => {
              if (!configNode) return null;
              const cfgNode = nodes.find((x) => x.id === configNode);
              if (!cfgNode) return null;
              const cfgMarket = byId.get(cfgNode.marketId);
              if (!cfgMarket) return null;
              const cfgFlow = flows.get(cfgNode.id);
              // Starved nodes show no subnode (configNode stays set, so it
              // reappears the moment funding lands again).
              if ((cfgFlow?.inflow ?? 0) <= DUST_USD) return null;
              const allowed = ACTIONS_FOR[cfgMarket.kind];
              const effectiveKind: NodeAction =
                addKind && allowed.includes(addKind)
                  ? addKind
                  : DEFAULT_ACTION[cfgMarket.kind];
              const SUB_W = 300;
              const subX = cfgNode.x + NODE_W + 10;
              const subY = Math.max(-10000, cfgNode.y);
              return (
                <div
                  className={`sc-config sc-subnode${kindOpen ? " dd-open" : ""}${dragAction ? " is-dragging" : ""}`}
                  style={{ left: subX, top: subY, width: SUB_W }}
                  role="dialog"
                  aria-label={`Configure ${cfgMarket.name}`}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div className="sc-sub-close">
                    <button
                      type="button"
                      className="sc-x static"
                      aria-label="Close configuration"
                      onClick={() => setConfigNode(null)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="sc-config-flow">
                    <span>
                      In <b>{fmtUsd(cfgFlow?.inflow ?? 0)}</b>
                    </span>
                    <span>
                      Avail <b>{fmtUsd(cfgFlow?.available ?? 0)}</b>
                    </span>
                    <span>
                      Out <b>{fmtUsd(cfgFlow?.out ?? 0)}</b>
                    </span>
                  </div>
                  <p className="sc-cap" style={{ marginTop: 10 }}>
                    Actions in order ({cfgNode.actions.length})
                  </p>
                  <div
                    className={`sc-config-list${dragAction ? " is-dragging" : ""}`}
                    onWheel={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onDragOver={(e) => {
                      // Trailing gap: hovering the list itself targets the end.
                      if ((e.target as HTMLElement).closest?.(".sc-cfg-action")) return;
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from =
                        dragAction ??
                        (() => {
                          try {
                            return e.dataTransfer.getData("text/plain") || null;
                          } catch {
                            return null;
                          }
                        })();
                      if (from) {
                        const cur = nodesRef.current
                          .find((x) => x.id === cfgNode.id)
                          ?.actions.map((x) => x.id) ?? [];
                        const last = cur[cur.length - 1];
                        if (last && from !== last) reorderAction(cfgNode.id, from, last, true);
                      }
                      setDragAction(null);
                      setDragOver(null);
                    }}
                  >
                    {cfgNode.actions.length === 0 && (
                      <p className="sc-note">No actions yet — add one below.</p>
                    )}
                    {cfgNode.actions.map((a) => {
                      const af = cfgFlow?.actions.find((x) => x.item.id === a.id);
                      const usd = af?.usd ?? 0;
                      const tokens = a.amount.trim() === "" ? NaN : Number(a.amount);
                      const unconfigured = !(
                        a.asset !== "" &&
                        Number.isFinite(tokens) &&
                        tokens > 0 &&
                        usd > 0
                      );
                      const dragging = dragAction === a.id;
                      const over = dragOver?.id === a.id && !dragging;
                      return (
                        <div
                          key={a.id}
                          className={`sc-cfg-action${dragging ? " dragging" : ""}${over ? (dragOver.after ? " drop-after" : " drop-before") : ""}`}
                          draggable
                          onDragStart={(e) => {
                            // Buttons/editors start clicks, never drags — only the
                            // card body + grip reorder.
                            if ((e.target as HTMLElement).closest?.(".sc-cfg-ops, .sc-cfg-main, button")) {
                              e.preventDefault();
                              return;
                            }
                            e.dataTransfer.effectAllowed = "move";
                            try {
                              e.dataTransfer.setData("text/plain", a.id);
                            } catch {
                              /* clipboard may be blocked */
                            }
                            setDragAction(a.id);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = "move";
                            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                            const after = e.clientY - rect.top > rect.height / 2;
                            setDragOver((cur) =>
                              cur?.id === a.id && cur.after === after ? cur : { id: a.id, after },
                            );
                          }}
                          onDragLeave={() => {
                            setDragOver((cur) => (cur?.id === a.id ? null : cur));
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const from =
                              dragAction ??
                              (() => {
                                try {
                                  return e.dataTransfer.getData("text/plain") || null;
                                } catch {
                                  return null;
                                }
                              })();
                            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                            const after = e.clientY - rect.top > rect.height / 2;
                            if (from && from !== a.id) reorderAction(cfgNode.id, from, a.id, after);
                            setDragAction(null);
                            setDragOver(null);
                          }}
                          onDragEnd={() => {
                            setDragAction(null);
                            setDragOver(null);
                          }}
                        >
                          <span
                            className="sc-cfg-grip"
                            title="Drag to reorder"
                            aria-hidden="true"
                          >
                            <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
                              <circle cx="3" cy="3" r="1.3" />
                              <circle cx="9" cy="3" r="1.3" />
                              <circle cx="3" cy="8" r="1.3" />
                              <circle cx="9" cy="8" r="1.3" />
                              <circle cx="3" cy="13" r="1.3" />
                              <circle cx="9" cy="13" r="1.3" />
                            </svg>
                          </span>
                          <span className={`sc-cfg-kind k-${a.kind}`}>
                            {ACTION_LABEL[a.kind]}
                          </span>
                          <button
                            type="button"
                            className="sc-cfg-main"
                            title="Edit token + amount"
                            onClick={() =>
                              setEditing({
                                nodeId: cfgNode.id,
                                actionId: a.id,
                                asset: a.asset,
                                amount: a.amount,
                              })
                            }
                          >
                            <span className="sc-cfg-asset">
                              {a.asset ? (
                                <TokenIcon symbol={a.asset} size={16} />
                              ) : null}
                              <b>{a.asset || "—"}</b>
                            </span>
                            <small className={unconfigured ? "need" : undefined}>
                              {a.amount.trim() === "" ? "set amount" : `${a.amount} → ${fmtUsd(usd)}`}
                            </small>
                          </button>
                          <span className="sc-cfg-ops">
                            <button
                              type="button"
                              className="sc-cfg-iconbtn"
                              aria-label={`Edit ${ACTION_LABEL[a.kind]} action`}
                              title="Edit"
                              onClick={() =>
                                setEditing({
                                  nodeId: cfgNode.id,
                                  actionId: a.id,
                                  asset: a.asset,
                                  amount: a.amount,
                                })
                              }
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="sc-cfg-iconbtn danger"
                              aria-label="Remove action"
                              title="Remove"
                              onClick={() => removeAction(cfgNode.id, a.id)}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3 6h18" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="sc-config-add">
                    <div className="sc-dd">
                      <button
                        type="button"
                        className="sc-dd-btn"
                        aria-haspopup="listbox"
                        aria-expanded={kindOpen}
                        onClick={() => setKindOpen((o) => !o)}
                      >
                        <span>+ Add {effectiveKind ? ACTION_LABEL[effectiveKind].toLowerCase() : "action"}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                      </button>
                      {kindOpen && (
                        <div className="sc-dd-list" role="listbox" aria-label="Action kind">
                          {allowed.map((k) => (
                            <button
                              key={k}
                              type="button"
                              role="option"
                              aria-selected={effectiveKind === k}
                              className={`sc-dd-opt${effectiveKind === k ? " sel" : ""}`}
                              onClick={() => {
                                setAddKind(k);
                                setKindOpen(false);
                                addAction(cfgNode.id, k);
                              }}
                            >
                              {ACTION_LABEL[k]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          {(selEdge || selNode || handleArm) && (
            <div
              className="sc-linkbar"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {renderLinkbar()}
            </div>
          )}
          {outOfView && (
            <button
              type="button"
              className="sc-recenter"
              onClick={recenter}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Back to content"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="4" x2="12" y2="20" />
                <polyline points="5 13 12 20 19 13" />
              </svg>
              Back to content
            </button>
          )}
          {ghost && (
            <div
              className={`sc-ghost${ghost.back ? " back" : ""}`}
              style={{ left: ghost.x, top: ghost.y }}
              aria-hidden="true"
            >
              <MarketIcon m={ghost.market} size={20} />
              <span className="sc-ghost-main">
                <b>{ghost.market.asset}</b>
                <small>
                  {ghost.market.apy != null ? `${ghost.market.apy.toFixed(2)}%` : "—"}
                </small>
              </span>
            </div>
          )}
        </div>

        {/* Right panel (memoized — skips pan/zoom frames) */}
        {sidePanel}
      </div>

      {/* Bottom bar */}
      <div className="sc-foot">
        <span className="sc-stat">
          Total allocated{" "}
          <b className={overAlloc ? "neg" : ""}>{srcTotal}%</b>
          {srcFixedUsd > 0 && <> + ${Math.round(srcFixedUsd).toLocaleString()}</>}
          {srcHasEntire && <> + remainder</>}
        </span>
        <span className="sc-stat">
          Est. net APY <b>{netApy.toFixed(2)}%</b>
        </span>
        <span className="sc-stat">
          Projected earnings (1yr){" "}
          <b>${Math.round(projected).toLocaleString()} / yr</b>
        </span>
        <span className="sc-stat">
          Risk{" "}
          <b className="sc-risk" title={riskTitle}>
            {riskLevel}
          </b>
        </span>
        {totalBorrowed > 0.01 && (
          <span className="sc-stat" title="Debt raised by borrow legs — not yield">
            Borrowed <b>${Math.round(totalBorrowed).toLocaleString()}</b>
          </span>
        )}
        {unknownApy && (
          <span className="sc-stat sc-dim" title="Some legs have no published APY yet">
            APYs live
          </span>
        )}
        <span className="sc-spacer" />
        {nodes.length > 0 && srcTotal !== 100 && (
          <button type="button" className="sc-btn ghost" onClick={splitEvenly}>
            Split evenly
          </button>
        )}
        <button
          type="button"
          className="sc-btn ghost"
          disabled={!ready}
          onClick={() => {
            if (graphErrors.length > 0) {
              setCreateError(
                graphErrors.length === 1
                  ? graphErrors[0]
                  : `${graphErrors[0]} (+${graphErrors.length - 1} more)`,
              );
              return;
            }
            setCreateError(graphWarnings.length > 0 ? graphWarnings[0] : null);
            setSimOpen(true);
          }}
        >
          Simulate strategy
        </button>
      </div>

      {createError && (
        <div className="sc-toast" role="status">
          {createError}
        </div>
      )}

      {/* Intent modal */}
      {intentOpen && (
        <div
          className="sc-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIntentOpen(false);
          }}
        >
          <div className="sc-modal" role="dialog" aria-modal="true" aria-label="Strategy intent">
            <div className="sc-modal-head">
              <h3>{name.trim() || "Untitled strategy"}</h3>
              <button
                type="button"
                className="sc-x"
                onClick={() => setIntentOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="sc-note">
              Unsigned intent — sign in Freighter to execute.
            </p>
            <pre className="sc-json">{JSON.stringify(intent, null, 2)}</pre>
            <div className="sc-modal-actions">
              <button
                type="button"
                className="sc-btn primary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      JSON.stringify(intent, null, 2),
                    );
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {copied ? "Copied ✓" : "Copy intent"}
              </button>
              <button
                type="button"
                className="sc-btn"
                onClick={() => setIntentOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simulate modal */}
      {simOpen && (
        <div
          className="sc-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSimOpen(false);
          }}
        >
          <div className="sc-modal" role="dialog" aria-modal="true" aria-label="Strategy simulation">
            <div className="sc-modal-head">
              <h3>Simulation</h3>
              <button
                type="button"
                className="sc-x"
                onClick={() => setSimOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="sc-note">
              One year at today&apos;s live APYs — snapshots, not promises.
            </p>
            <div className="sc-table">
              <div className="sc-thead">
                <span>Leg</span>
                <span>Supply</span>
                <span>APY</span>
                <span>Est. $/yr</span>
              </div>
              {legs.flatMap((l) => {
                const f = flows.get(l.node.id);
                if (!f) return [];
                const m = l.market!;
                return f.actions.map((af) => {
                  const isB = af.item.kind === "borrow";
                  const amt =
                    isB || af.item.kind === "withdraw" ? af.produced : af.consumed;
                  const rate = isB ? af.borrowApy : af.supplyApy;
                  const earns =
                    isB ||
                    af.item.kind === "supply" ||
                    af.item.kind === "deposit";
                  const yr = earns
                    ? (isB ? -1 : 1) * (amt * ((rate ?? 0) / 100))
                    : 0;
                  return (
                    <div className="sc-trow" key={`${l.node.id}|${af.item.id}`}>
                      <span title={`${l.market!.name} · ${af.item.asset}`}>
                        {l.market!.name} · {af.item.asset}{" "}
                        <small>
                          {ACTION_LABEL[af.item.kind].toLowerCase()}
                        </small>
                      </span>
                      <span>{fmtUsd(amt)}</span>
                      <span>
                        {isB
                          ? rate != null
                            ? `${rate.toFixed(2)}% cost`
                            : "—"
                          : rate != null
                            ? `${rate.toFixed(2)}%`
                            : "—"}
                      </span>
                      <span>
                        {earns && rate != null
                          ? `${yr < 0 ? "−" : ""}$${Math.round(Math.abs(yr)).toLocaleString()}`
                          : "—"}
                      </span>
                    </div>
                  );
                });
              })}
              <div className="sc-trow total">
                <span>Total</span>
                <span>{fmtUsd(grossSupply)}</span>
                <span>{netApy.toFixed(2)}%</span>
                <span>${Math.round(projected).toLocaleString()}</span>
              </div>
              {totalBorrowed > 0.01 && (
                <div className="sc-trow total">
                  <span>Debt (not yield)</span>
                  <span>{fmtUsd(totalBorrowed)}</span>
                  <span>—</span>
                  <span>−${Math.round(costY).toLocaleString()}/yr</span>
                </div>
              )}
            </div>
            <div className="sc-modal-actions">
              <button
                type="button"
                className="sc-btn"
                onClick={() => setSimOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Per-action modal: token + amount for one ordered action. */}
      {editing &&
        (() => {
          const eNode = nodes.find((x) => x.id === editing.nodeId);
          const eMarket = eNode ? byId.get(eNode.marketId) : null;
          const eAction = eNode?.actions.find((a) => a.id === editing.actionId);
          if (!eNode || !eMarket || !eAction) return null;
          const px = prices[editing.asset] ?? null;
          const amtNum = editing.amount.trim() === "" ? NaN : Number(editing.amount);
          const usd = px != null && px > 0 && Number.isFinite(amtNum) && amtNum > 0 ? amtNum * px : 0;
          const valid =
            editing.asset !== "" && Number.isFinite(amtNum) && amtNum > 0 && usd > 0;
          return (
            <div
              className="sc-overlay"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setEditing(null);
              }}
            >
              <div
                className={`sc-modal sc-actmodal${assetOpen ? " dd-open" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label={`Edit ${ACTION_LABEL[eAction.kind]} action`}
              >
                <div className="sc-modal-head">
                  <h3>
                    {ACTION_LABEL[eAction.kind]} · {eMarket.name}
                  </h3>
                  <button
                    type="button"
                    className="sc-x"
                    onClick={() => setEditing(null)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <p className="sc-note">
                  Order #{eNode.actions.findIndex((a) => a.id === eAction.id) + 1} of{" "}
                  {eNode.actions.length} — amounts are token units, converted through live
                  prices.
                </p>
                <p className="sc-cap">Token</p>
                <div className="sc-dd">
                  <button
                    type="button"
                    className="sc-dd-btn sc-actselect-btn"
                    aria-haspopup="listbox"
                    aria-expanded={assetOpen}
                    onClick={() => setAssetOpen((o) => !o)}
                  >
                    <span className="sc-dd-sel">
                      {editing.asset ? (
                        <TokenIcon symbol={editing.asset} size={16} />
                      ) : null}
                      <b>{editing.asset || "—"}</b>
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {assetOpen && (
                    <div className="sc-dd-list" role="listbox" aria-label="Action token">
                      {eMarket.assets.length === 0 && (
                        <p className="sc-note">No assets in this pool.</p>
                      )}
                      {eMarket.assets.map((a) => (
                        <button
                          key={a.code}
                          type="button"
                          role="option"
                          aria-selected={editing.asset === a.code}
                          className={`sc-dd-opt asset${editing.asset === a.code ? " sel" : ""}`}
                          onClick={() => {
                            setEditing({ ...editing, asset: a.code });
                            setAssetOpen(false);
                            void ensurePrices([a.code]);
                          }}
                        >
                          <TokenIcon symbol={a.code} size={18} />
                          <b>{a.code}</b>
                          <small>
                            {a.supplyApy != null ? `${a.supplyApy.toFixed(2)}% APY` : "—"}
                          </small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="sc-cap">Amount (tokens)</p>
                <input
                  className="sc-actinput"
                  value={editing.amount}
                  onChange={(e) => setEditing({ ...editing, amount: numOnly(e.target.value) })}
                  inputMode="decimal"
                  placeholder="0.0"
                  aria-label="Action amount in tokens"
                />
                <div className="sc-kv">
                  <span>Live value</span>
                  <b>{usd > 0 ? fmtUsd(usd) : "—"}</b>
                </div>
                {eAction.kind === "borrow" &&
                  (() => {
                    const mFlow = flows.get(eNode.id);
                    const books = nodeBooks(eMarket, mFlow?.actions ?? []);
                    const withDraft = books.debt + (usd > 0 ? usd : 0);
                    const usedPct =
                      books.power > DUST_USD ? Math.round((withDraft / books.power) * 100) : null;
                    return (
                      <div className="sc-borrowctx">
                        <div className="sc-kv">
                          <span>Borrow power</span>
                          <b>{books.power > DUST_USD ? fmtUsd(books.power) : "—"}</b>
                        </div>
                        {books.lines.map((ln) => (
                          <div className="sc-kv sc-dim" key={ln.code}>
                            <span>
                              {ln.code} · LTV {ln.ltv}%
                            </span>
                            <b>{fmtUsd(ln.usd)}</b>
                          </div>
                        ))}
                        <div className="sc-kv">
                          <span>Debt in this pool</span>
                          <b>{fmtUsd(books.debt)}</b>
                        </div>
                        <div className="sc-kv">
                          <span>Power used incl. draft</span>
                          <b className={usedPct != null && usedPct > 90 ? "warn" : undefined}>
                            {usedPct != null ? `${usedPct}%` : "—"}
                          </b>
                        </div>
                        {books.power <= DUST_USD && (
                          <p className="sc-node-err" role="alert">
                            No collateral yet — supply in this pool first.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                {px == null && (
                  <p className="sc-node-err" role="alert">
                    Price unavailable for {editing.asset} — pick a priced token.
                  </p>
                )}
                <div className="sc-modal-actions">
                  <button
                    type="button"
                    className="sc-btn primary"
                    disabled={!valid}
                    onClick={() => {
                      updateAction(editing.nodeId, editing.actionId, {
                        asset: editing.asset,
                        amount: editing.amount,
                      });
                      void ensurePrices([editing.asset]);
                      setEditing(null);
                    }}
                  >
                    Save action
                  </button>
                  <button
                    type="button"
                    className="sc-btn"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
