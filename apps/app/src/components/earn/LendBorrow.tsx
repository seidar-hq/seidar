"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import Typography from "@mui/material/Typography";
import DataTable, { type Column } from "@/components/common/DataTable";
import Tabs from "@/components/common/Tabs";
import TokenLogo from "@/components/common/TokenLogo";
import Shimmer from "@/components/common/Shimmer";
import TxDialog from "@/components/tx/TxDialog";
import { formatAmount, formatUsd } from "@/lib/format";
import { runBuilt, type TxStep } from "@/lib/tx";
import { useWallet, walletLabel } from "@/wallet/WalletContext";
import { EarnGrid } from "./EarnParts";
import { AssetStack, ProtocolChips, RowAction, SearchBox, StatusPill, TopList } from "./EarnUI";
import {
  LEND_PROTOCOLS,
  actionBlock,
  blndApr,
  compactUsd,
  groupPools,
  marketStatus,
  pct,
  poolHref,
  useBlndPrice,
  useLendMarkets,
  useLendPositions,
  type LendPool,
  type LendProtocol,
  type Market,
  type UserLeg,
} from "./lendData";

// Lend & Borrow index: one row per Blend pool / XOXNO hub (its assets, size, best rates and your
// position in it), your positions grouped the same way, and BLND rewards to claim. Supplying,
// borrowing and leverage all happen on the pool's page.

const Num = ({ children, color = "black.main100" }: { children: React.ReactNode; color?: string }) => (
  <Typography variant="body1" sx={{ color, fontSize: "1rem", whiteSpace: "nowrap" }}>
    {children}
  </Typography>
);

const healthColor = (h: number | null | undefined) => (h == null ? "grey.200" : h < 1.1 ? "error.main" : h < 1.5 ? "orange.main" : "green.main");

function PoolCell({ p, sub }: { p: LendPool; sub: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "0.875rem", minWidth: 0 }}>
      <AssetStack markets={p.markets} max={3} size="2rem" />
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Typography sx={{ fontSize: "1rem", color: "common.black", whiteSpace: "nowrap" }}>{p.name}</Typography>
          <StatusPill info={marketStatus(p.status)} small />
        </Box>
        <Typography sx={{ fontSize: "0.75rem", color: "grey.200", textTransform: "uppercase", whiteSpace: "nowrap" }}>{sub}</Typography>
      </Box>
    </Box>
  );
}

/** Asset logos over a caption ("Collateral assets"), as in real Seidar's hub rows. */
function AssetsCol({ list, caption, empty = "None" }: { list: Market[]; caption: string; empty?: string }) {
  return (
    <Box sx={{ display: { xs: "none", md: "flex" }, flexDirection: "column", gap: "0.375rem", alignItems: "flex-start", minWidth: 0 }}>
      {list.length ? <AssetStack markets={list} max={4} size="1.5rem" /> : <Typography sx={{ fontSize: "0.875rem", color: "grey.200", lineHeight: "1.5rem" }}>{empty}</Typography>}
      <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>{caption}</Typography>
    </Box>
  );
}

/** One pool: logo, name + status, "N assets · TVL · Borrowed", collateral and debt assets, Manage. */
function PoolCard({ p, hint, mine, onOpen }: { p: LendPool; hint?: string; mine?: { net: number; health: number | null; debt: number } | null; onOpen: () => void }) {
  const meta = LEND_PROTOCOLS[p.protocol];
  return (
    <ButtonBase
      component="div"
      onClick={onOpen}
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr) auto", md: "minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr) auto" },
        gap: "0.75rem",
        alignItems: "center",
        width: "100%",
        minHeight: "5.25rem",
        p: "0.875rem 0.75rem",
        textAlign: "left",
        backgroundColor: "transparent",
        borderBottom: (t) => `0.0625rem solid ${t.palette.border.table}`,
        "&:last-of-type": { borderBottom: "none" },
        transition: "background-color 120ms ease",
        "&:hover": { backgroundColor: "surfaceBg.softInset" },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
        <Box component="img" src={meta.logo} alt="" sx={{ width: "2.25rem", height: "2.25rem", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: "1rem", color: "common.black" }} noWrap>
              {p.name}
            </Typography>
            <StatusPill info={marketStatus(p.status)} small />
            {mine && (
              <Box
                component="span"
                sx={{ display: "inline-flex", alignItems: "center", height: "1.375rem", px: "0.5rem", borderRadius: "999rem", fontSize: "0.6875rem", fontWeight: 500, color: "green.main", backgroundColor: "rgba(1, 186, 100, 0.12)" }}
              >
                Your position
              </Box>
            )}
          </Box>
          {/* Wraps on phones instead of cutting off the borrowed figure. */}
          <Typography sx={{ fontSize: "0.75rem", color: "grey.200", whiteSpace: { xs: "normal", sm: "nowrap" }, overflow: "hidden", textOverflow: "ellipsis" }}>
            {hint ?? `${p.markets.length} asset${p.markets.length === 1 ? "" : "s"}`} · TVL: {compactUsd(p.suppliedUsd)}
            {p.borrowedUsd > 0 ? ` · Borrowed ${compactUsd(p.borrowedUsd)}` : ""}
          </Typography>
          {mine && (
            <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }} noWrap>
              You: <Box component="span" sx={{ color: "common.black" }}>{formatUsd(mine.net)}</Box>
              {mine.debt > 0.01 && (
                <>
                  {" · Safety "}
                  <Box component="span" sx={{ color: healthColor(mine.health) }}>{mine.health != null ? `${(mine.health * 100).toFixed(0)}%` : "N/A"}</Box>
                </>
              )}
            </Typography>
          )}
        </Box>
      </Box>
      <AssetsCol list={p.collaterals} caption="Collateral assets" />
      <AssetsCol list={p.borrowables} caption="Debt assets" />
      <RowAction label="Manage" onClick={onOpen} />
    </ButtonBase>
  );
}

/** A venue (Blend / XOXNO): logo, name, "N pools · TVL · Borrowed", collapse, then its pool cards. */
function VenueCard({ id, count, tvl, borrowed, children }: { id: LendProtocol; count: number; tvl: number; borrowed: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const meta = LEND_PROTOCOLS[id];
  return (
    <Box sx={{ my: "0.75rem", backgroundColor: "grey.400", padding: "1.25rem", borderRadius: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", ml: "0.5rem" }}>
        <Box component="img" src={meta.logo} alt="" sx={{ width: "2.25rem", height: "2.25rem", borderRadius: "50%", objectFit: "cover" }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 500, fontSize: "1.375rem", color: "common.black", lineHeight: 1.2 }}>
            {meta.name}
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
            {count} {id === "xoxno" ? "hub" : "pool"}
            {count === 1 ? "" : "s"} · TVL {compactUsd(tvl)} · Borrowed {compactUsd(borrowed)}
          </Typography>
        </Box>
        <ButtonBase
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${meta.name} pools`}
          onClick={() => setOpen((o) => !o)}
          sx={{ ml: "auto", width: "2.25rem", height: "2.25rem", borderRadius: "50%", backgroundColor: "overlay.white08", "&:hover": { backgroundColor: "overlay.white20" } }}
        >
          <KeyboardArrowDownRoundedIcon sx={{ fontSize: "1.25rem", color: "common.black", transform: open ? "none" : "rotate(-90deg)", transition: "transform 180ms ease" }} />
        </ButtonBase>
      </Box>
      <Collapse in={open}>{children}</Collapse>
    </Box>
  );
}

/** The bordered table card our Earn tables sit in. */
function RowsCard({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ backgroundColor: "surfaceBg.section", border: (t) => `0.0625rem solid ${t.palette.border.main1000}`, borderRadius: "1.25rem", p: "0.5rem 1.25rem", overflow: "hidden" }}>
      {children}
    </Box>
  );
}

type PoolPos = {
  key: string;
  wallet: string;
  pool: LendPool | null;
  protocol: LendProtocol;
  poolId: string;
  accountId?: string;
  legs: UserLeg[];
  supUsd: number;
  debtUsd: number;
  health: number | null;
  netApy: number | null;
  blnd: number;
};

export default function LendBorrow({ tabs }: { tabs: React.ReactNode }) {
  const router = useRouter();
  const { activeWallet, portfolioAddresses, portfolioWallets, switchWallet } = useWallet();
  const { markets, loading } = useLendMarkets();
  const positions = useLendPositions(portfolioAddresses);
  const blndPx = useBlndPrice();
  const posBusy = positions.refreshing;
  const posFirstLoad = positions.loading && positions.legs.length === 0 && portfolioAddresses.length > 0;
  const [proto, setProto] = useState<string>("all");
  const [mode, setMode] = useState<string>("markets");
  const [q, setQ] = useState("");
  const [claim, setClaim] = useState<{ steps: TxStep[]; error: string | null; open: boolean }>({ steps: [], error: null, open: false });

  const pools = useMemo(() => groupPools(markets).filter((p) => p.suppliedUsd >= 1 || (p.status ?? 0) < 6), [markets]);
  const multi = portfolioWallets.length > 1 && portfolioAddresses.length > 1;
  const walletName = (a: string) => {
    const w = portfolioWallets.find((x) => x.address === a);
    return w ? walletLabel(w) : a.slice(0, 6);
  };
  const query = q.trim().toLowerCase();
  const matchingAssets = (p: LendPool) => (query ? p.markets.filter((m) => m.code.toLowerCase().includes(query)) : []);
  const matches = (p: LendPool) => !query || p.name.toLowerCase().includes(query) || matchingAssets(p).length > 0;
  const venues = (["blend", "xoxno"] as LendProtocol[]).filter((p) => proto === "all" || proto === p);
  const go = (p: { protocol: LendProtocol; pool: string }, opts: Parameters<typeof poolHref>[1] = {}, wallet?: string) => {
    if (wallet && wallet !== activeWallet?.address) switchWallet(wallet);
    router.push(poolHref(p, opts));
  };

  // ---- your positions, one row per wallet x pool (x XOXNO account) ----
  const mine = useMemo<PoolPos[]>(() => {
    const by = new Map<string, PoolPos>();
    for (const l of positions.legs) {
      if (l.suppliedUsd <= 0.01 && l.borrowedUsd <= 0.01 && l.supplied <= 0 && l.borrowed <= 0) continue;
      const key = `${l.wallet}|${l.protocol}|${l.pool}|${l.xoxno?.accountId ?? ""}`;
      let r = by.get(key);
      if (!r) {
        const p = pools.find((x) => x.protocol === l.protocol && x.pool === l.pool) ?? null;
        r = {
          key,
          wallet: l.wallet,
          pool: p,
          protocol: l.protocol,
          poolId: l.pool,
          accountId: l.xoxno?.accountId,
          legs: [],
          supUsd: 0,
          debtUsd: 0,
          health: l.protocol === "blend" ? (positions.pools[l.wallet]?.[l.pool]?.healthFactor ?? null) : (positions.xoxnoHealth[l.wallet] ?? null),
          netApy: null,
          blnd: l.protocol === "blend" ? (positions.pools[l.wallet]?.[l.pool]?.claimableBlnd ?? 0) : 0,
        };
        by.set(key, r);
      }
      r.legs.push(l);
      r.supUsd += l.suppliedUsd;
      r.debtUsd += l.borrowedUsd;
    }
    for (const r of by.values()) {
      const mk = (c: string) => r.pool?.markets.find((m) => m.contract === c);
      const earn = r.legs.reduce((a, l) => a + l.suppliedUsd * (mk(l.contract)?.supplyApy ?? 0) - l.borrowedUsd * (mk(l.contract)?.borrowApy ?? 0), 0);
      const net = r.supUsd - r.debtUsd;
      r.netApy = net > 0.01 ? earn / net : null;
    }
    return [...by.values()].sort((a, b) => b.supUsd - a.supUsd);
  }, [positions.legs, positions.pools, positions.xoxnoHealth, pools]);

  // ---- BLND rewards across the portfolio's wallets ----
  const rewards = useMemo(() => {
    const out: { wallet: string; pool: string; name: string; blnd: number }[] = [];
    for (const [wallet, byPool] of Object.entries(positions.pools))
      for (const [pool, info] of Object.entries(byPool))
        if (info.claimableBlnd > 0.0001) out.push({ wallet, pool, name: pools.find((p) => p.pool === pool)?.name ?? `${pool.slice(0, 6)}…`, blnd: info.claimableBlnd });
    return out.sort((a, b) => b.blnd - a.blnd);
  }, [positions.pools, pools]);
  const totalBlnd = rewards.reduce((s, r) => s + r.blnd, 0);

  const runClaim = async (wallet: string, pool: string) => {
    if (!activeWallet) return;
    if (wallet !== activeWallet.address) {
      switchWallet(wallet);
      return;
    }
    setClaim({ steps: [{ key: "s0", label: "Claim BLND rewards", status: "building" }], error: null, open: true });
    try {
      await runBuilt("/api/lending/claim", { from: activeWallet.address, pool }, activeWallet, (steps) => setClaim((c) => ({ ...c, steps })));
    } catch (e) {
      setClaim((c) => ({ ...c, error: e instanceof Error ? e.message : String(e) }));
    }
  };

  // ---- columns ----
  const myPos = (p: LendPool) => mine.filter((r) => r.protocol === p.protocol && r.poolId === p.pool);
  const posCols: Column<PoolPos>[] = [
    {
      id: "pool",
      header: "Pool",
      cell: (r) =>
        r.pool ? (
          <PoolCell p={r.pool} sub={[LEND_PROTOCOLS[r.protocol].name, r.accountId ? `Position #${r.accountId}` : null, multi ? walletName(r.wallet) : null].filter(Boolean).join(" · ")} />
        ) : (
          <Num>{r.poolId.slice(0, 8)}…</Num>
        ),
    },
    {
      id: "supplied",
      header: "Supplied",
      cell: (r) => {
        const legs = r.legs.filter((l) => l.supplied > 0);
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {legs.length > 0 && <AssetStack markets={legs.map((l) => ({ code: l.code, contract: l.contract, issuer: null }))} max={3} size="1.25rem" />}
            <Num color="common.black">
              <Shimmer on={posBusy} width="4rem">{legs.length ? formatUsd(r.supUsd) : "$0.00"}</Shimmer>
            </Num>
          </Box>
        );
      },
      sortValue: (r) => r.supUsd,
    },
    {
      id: "borrowed",
      header: "Borrowed",
      cell: (r) => {
        const legs = r.legs.filter((l) => l.borrowed > 0);
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {legs.length > 0 && <AssetStack markets={legs.map((l) => ({ code: l.code, contract: l.contract, issuer: null }))} max={3} size="1.25rem" />}
            <Num color="common.black">
              <Shimmer on={posBusy} width="4rem">{legs.length ? formatUsd(r.debtUsd) : "No debt"}</Shimmer>
            </Num>
          </Box>
        );
      },
      sortValue: (r) => r.debtUsd,
    },
    { id: "net", header: "Net APY", cell: (r) => <Num color={r.netApy != null && r.netApy < 0 ? "error.main" : "green.main"}>{pct(r.netApy)}</Num>, sortValue: (r) => r.netApy },
    {
      id: "health",
      header: "Safety ratio",
      cell: (r) => (
        <Box
          component="span"
          sx={{
            display: "inline-flex",
            px: "0.625rem",
            py: "0.25rem",
            borderRadius: "999rem",
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: r.debtUsd > 0.01 ? healthColor(r.health) : "grey.200",
            backgroundColor: "overlay.white08",
          }}
        >
          <Shimmer on={posBusy} width="3rem">{r.debtUsd > 0.01 ? (r.health != null ? `${(r.health * 100).toFixed(2)}%` : "N/A") : "No debt"}</Shimmer>
        </Box>
      ),
      sortValue: (r) => r.health,
    },
    {
      id: "rewards",
      header: "Rewards",
      cell: (r) => <Num color={r.blnd > 0 ? "green.main" : "grey.200"}>{r.protocol === "blend" ? (r.blnd > 0 ? `${formatAmount(r.blnd, 2)} BLND` : "None") : "In APY"}</Num>,
      sortValue: (r) => r.blnd,
    },
    {
      id: "action",
      header: "",
      align: "center",
      cell: (r) => <RowAction label="Manage" onClick={() => go({ protocol: r.protocol, pool: r.poolId }, { account: r.accountId }, r.wallet)} />,
    },
  ];

  const section = (p: LendProtocol) => {
    const all = pools.filter((x) => x.protocol === p);
    const list = all.filter(matches);
    const rows = mine.filter((r) => r.protocol === p && (!query || (r.pool && matches(r.pool))));
    const tvl = all.reduce((s, x) => s + x.suppliedUsd, 0);
    const bor = all.reduce((s, x) => s + x.borrowedUsd, 0);
    const meta = LEND_PROTOCOLS[p];
    const yours = (x: LendPool) => {
      const rs = myPos(x);
      if (!rs.length) return null;
      const h = rs.map((r) => r.health).filter((v): v is number => v != null);
      return { net: rs.reduce((s, r) => s + r.supUsd - r.debtUsd, 0), debt: rs.reduce((s, r) => s + r.debtUsd, 0), health: h.length ? Math.min(...h) : null };
    };
    return (
      <VenueCard key={p} id={p} count={all.length} tvl={tvl} borrowed={bor}>
        {mode === "markets" ? (
          <RowsCard>
            {loading && !all.length ? (
              [0, 1, 2].map((i) => (
                <Box key={i} sx={{ py: "0.75rem" }}>
                  <Shimmer on width="100%" height="3.5rem" />
                </Box>
              ))
            ) : list.length ? (
              list.map((x) => {
                const hit = matchingAssets(x);
                return <PoolCard key={x.key} p={x} mine={yours(x)} hint={hit.length ? `Has ${hit.map((m) => m.code).slice(0, 3).join(", ")}` : undefined} onOpen={() => go(x)} />;
              })
            ) : (
              <Typography sx={{ color: "grey.200", fontSize: "0.875rem", p: "1.5rem", textAlign: "center" }}>{query ? "No pool has that asset or name" : `${meta.name} markets didn't load: reload to retry`}</Typography>
            )}
          </RowsCard>
        ) : (
          <DataTable
            skeletonId={`lend-positions-${p}`}
            variant="inset"
            columns={posCols}
            rows={rows}
            isLoading={posFirstLoad}
            emptyDataText={portfolioAddresses.length ? `No ${meta.name} positions in this portfolio` : "Connect a wallet to see your positions"}
            emptyMinHeight="10rem"
            getRowId={(r) => r.key}
            onRowClick={(r) => go({ protocol: r.protocol, pool: r.poolId }, { account: r.accountId }, r.wallet)}
            defaultSort={{ id: "supplied", dir: "desc" }}
          />
        )}
      </VenueCard>
    );
  };

  const top = useMemo(
    () =>
      [...markets]
        .filter((m) => m.suppliedUsd >= 50_000 && m.supplyApy != null && !actionBlock(m, "supply"))
        .sort((a, b) => (b.supplyApy ?? 0) + (blndApr(b, "supply", blndPx) ?? 0) - ((a.supplyApy ?? 0) + (blndApr(a, "supply", blndPx) ?? 0)))
        .slice(0, 6),
    [markets, blndPx],
  );

  const main = (
    <>
      <ProtocolChips items={(["blend", "xoxno"] as LendProtocol[]).map((p) => ({ id: p, label: LEND_PROTOCOLS[p].name, logo: LEND_PROTOCOLS[p].logo }))} value={proto} onChange={setProto} />
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", mt: "1.25rem", mb: "0.25rem" }}>
        <Tabs
          tabs={[
            { id: "markets", label: "Markets", padding: "0 1rem" },
            { id: "positions", label: `Your positions${mine.length ? ` (${mine.length})` : ""}`, padding: "0 1rem" },
          ]}
          activeTab={mode}
          setActiveTab={setMode}
          isPathProvided={false}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search pool or asset" />
      </Box>
      {venues.map(section)}
    </>
  );

  const side = (
    <>
      {portfolioAddresses.length > 0 && (
        <Box
          sx={{
            borderRadius: "1.25rem",
            border: (t) => `0.0625rem solid ${t.palette.border.main1000}`,
            backgroundColor: "surfaceBg.section",
            p: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.875rem",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
              <TokenLogo code="BLND" size="1.75rem" />
              <Typography sx={{ fontSize: "1.25rem", fontWeight: 600, color: "common.black" }}>Your Rewards</Typography>
            </Box>
            <Box sx={{ textAlign: "right" }}>
              <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: totalBlnd > 0 ? "green.main" : "common.black" }}>
                <Shimmer on={posFirstLoad || posBusy} width="4rem">{`${formatAmount(totalBlnd, 2)} BLND`}</Shimmer>
              </Typography>
              {totalBlnd > 0 && blndPx && <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>≈ {formatUsd(totalBlnd * blndPx)}</Typography>}
            </Box>
          </Box>
          {rewards.length === 0 ? (
            <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
              {posFirstLoad ? "Checking your pools…" : "Blend pays BLND on supply and borrows in many pools. Rewards you earn show here, ready to claim."}
            </Typography>
          ) : (
            rewards.map((r) => (
              <Box
                key={`${r.wallet}${r.pool}`}
                sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", p: "0.75rem 1rem", borderRadius: "1rem", backgroundColor: "overlay.white04", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}` }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: "0.9375rem", color: "common.black" }} noWrap>
                    {formatAmount(r.blnd, 4)} BLND
                  </Typography>
                  <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }} noWrap>
                    {r.name}
                    {multi ? ` · ${walletName(r.wallet)}` : ""}
                    {blndPx ? ` · ${formatUsd(r.blnd * blndPx)}` : ""}
                  </Typography>
                </Box>
                <RowAction label={r.wallet === activeWallet?.address ? "Claim" : "Switch"} tip={r.wallet === activeWallet?.address ? null : "These rewards belong to another wallet in this portfolio: switch to it to claim"} onClick={() => void runClaim(r.wallet, r.pool)} />
              </Box>
            ))
          )}
        </Box>
      )}
      <TopList
        title="Top Markets"
        nameLabel="Markets"
        valueLabel="Supply APY"
        emptyText="No market qualifies right now."
        loading={loading}
        items={top.map((m) => {
          const b = blndApr(m, "supply", blndPx);
          return {
            key: m.key,
            icon: <TokenLogo code={m.code} issuer={m.issuer} contract={m.contract} size="2.75rem" />,
            title: m.code,
            subtitle: m.poolName,
            badge: { name: LEND_PROTOCOLS[m.protocol].name, logo: LEND_PROTOCOLS[m.protocol].logo },
            value: b ? `${pct((m.supplyApy ?? 0) + b)}` : pct(m.supplyApy),
            onClick: () => go(m, { asset: m.contract ?? m.code, mode: "supply" }),
          };
        })}
      />
    </>
  );

  return (
    <>
      <EarnGrid tabs={tabs} main={main} side={side} pinned />
      <TxDialog open={claim.open} title="Claim rewards" steps={claim.steps} error={claim.error} onClose={() => setClaim((c) => ({ ...c, open: false }))} />
    </>
  );
}
