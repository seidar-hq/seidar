"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import DataTable, { type Column } from "@/components/common/DataTable";
import GlassDialog, { MODAL } from "@/components/common/GlassDialog";
import Tabs from "@/components/common/Tabs";
import TokenLogo from "@/components/common/TokenLogo";
import { SearchIcon } from "@/components/icons/HeaderIcons";
import TxDialog from "@/components/tx/TxDialog";
import { apiJson } from "@/lib/api";
import { formatAmount, formatUsd } from "@/lib/format";
import { runBuilt, toBase, type TxStep } from "@/lib/tx";
import { useSharedMany } from "@/lib/useShared";
import { usePortfolio, useTokenCatalogue, type SupplyRow } from "@/portfolio/usePortfolio";
import { useBalances } from "@/wallet/useBalances";
import { useWallet } from "@/wallet/WalletContext";
import { EarnGrid, SideCard } from "./EarnParts";

const VENUES = [
  { id: "soroswap", name: "Soroswap" },
  { id: "aqua", name: "Aquarius" },
  { id: "phoenix", name: "Phoenix" },
] as const;
const venueName = (id: string) => VENUES.find((v) => v.id === id)?.name ?? id;

type PoolRow = {
  protocol: string;
  address: string;
  pair: string;
  assets: { contract: string; code: string }[];
  poolType: string;
  feeBps: number | null;
  tvlUsd: number | null;
  reserves?: { code: string; amount: number; decimals: number }[];
};

const Chip = styled(ButtonBase, { shouldForwardProp: (p) => p !== "active" })<{ active?: boolean }>(({ theme, active }) => ({
  padding: "0.375rem 0.875rem",
  borderRadius: "999rem",
  fontSize: "0.8125rem",
  color: active ? theme.palette.sidebar.white : theme.palette.sidebar.subText,
  backgroundColor: active ? theme.palette.sidebar.primary : theme.palette.overlay.white05,
}));

const Search = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  height: "2.5rem",
  padding: "0 0.875rem",
  borderRadius: "999rem",
  backgroundColor: theme.palette.surfaceBg.softInset,
  minWidth: "14rem",
}));

const Inset = styled(Box)({ display: "flex", flexDirection: "column", gap: "0.5rem", padding: "1rem", borderRadius: "1rem", backgroundColor: MODAL.inset });

function PairLogos({ legs, size = "1.75rem" }: { legs: { code: string; issuer: string | null }[]; size?: string }) {
  return (
    <Box sx={{ display: "flex" }}>
      {legs.slice(0, 2).map((l, i) => (
        <Box key={`${l.code}${i}`} sx={{ ml: i ? "-0.5rem" : 0 }}>
          <TokenLogo code={l.code} issuer={l.issuer} size={size} />
        </Box>
      ))}
    </Box>
  );
}

function LiquidityDialog({
  pool,
  position,
  initial,
  onClose,
}: {
  pool: PoolRow;
  position: SupplyRow | undefined;
  initial: "deposit" | "withdraw";
  onClose: () => void;
}) {
  const { activeWallet } = useWallet();
  const { byContract } = useTokenCatalogue();
  const { byAddress } = useBalances(activeWallet ? [activeWallet.address] : []);
  const [tab, setTab] = useState<string>(initial);
  const [amounts, setAmounts] = useState(["", ""]);
  const [pct, setPct] = useState(100);
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [txOpen, setTxOpen] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const legs = pool.assets.map((a) => {
    const meta = byContract.get(a.contract);
    const bal = activeWallet ? byAddress[activeWallet.address]?.tokens.find((t) => t.code === (meta?.code ?? a.code) && (t.issuer ?? null) === (meta?.issuer ?? null)) : undefined;
    return { ...a, issuer: meta?.issuer ?? null, decimals: meta?.decimals ?? 7, balance: bal?.amount ?? 0 };
  });
  const res = pool.reserves ?? [];
  // Mirror the pool's reserve ratio as the user types (two-token pools).
  const ratio = res.length === 2 && res[0].amount > 0 ? res[1].amount / 10 ** res[1].decimals / (res[0].amount / 10 ** res[0].decimals) : null;
  const setLeg = (i: number, v: string) => {
    if (!/^\d*\.?\d*$/.test(v)) return;
    const next = [...amounts];
    next[i] = v;
    if (ratio && v && Number(v) > 0) next[1 - i] = String(Number((i === 0 ? Number(v) * ratio : Number(v) / ratio).toFixed(7)));
    setAmounts(next);
  };
  const tooMuch = legs.some((l, i) => Number(amounts[i] || 0) > l.balance + 1e-9);
  const concentrated = pool.poolType === "concentrated";

  const run = async () => {
    if (!activeWallet) return;
    const body =
      tab === "deposit"
        ? { protocol: pool.protocol, pool: pool.address, from: activeWallet.address, action: "deposit", amounts: legs.map((l, i) => toBase(amounts[i] || "0", l.decimals) ?? "0"), slippageBps: 100 }
        : {
            protocol: pool.protocol,
            pool: pool.address,
            from: activeWallet.address,
            action: "withdraw",
            shares: position?.shares ? ((BigInt(position.shares) * BigInt(pct)) / BigInt(100)).toString() : "0",
            slippageBps: 100,
          };
    setSteps([{ key: "s0", label: `${tab === "deposit" ? "Add" : "Remove"} liquidity · ${pool.pair}`, status: "building" }]);
    setTxError(null);
    setTxOpen(true);
    try {
      const r = await runBuilt("/api/dex/liquidity/build", body, activeWallet, setSteps);
      if (!r.unsigned) onClose();
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    }
  };

  const blocker = concentrated
    ? "CONCENTRATED POOL: USE AQUARIUS"
    : tab === "deposit" && !amounts.some((a) => Number(a) > 0)
      ? "ENTER AMOUNTS"
      : tab === "deposit" && tooMuch
        ? "INSUFFICIENT BALANCE"
        : tab === "withdraw" && !position?.shares
          ? "NO LIQUIDITY IN THIS POOL"
          : null;
  const ok = !blocker;
  const cta = blocker ?? (tab === "deposit" ? "ADD LIQUIDITY" : "REMOVE LIQUIDITY");

  return (
    <>
      <GlassDialog
        open={!txOpen}
        onClose={onClose}
        title={`${pool.pair} · ${venueName(pool.protocol)}`}
        titleIcon={<PairLogos legs={legs} />}
        actions={
          <Button variant="solid" color="primary" fullWidth disabled={!ok} onClick={() => void run()} sx={{ height: "3rem", borderRadius: "999rem" }}>
            {cta}
          </Button>
        }
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <Tabs
            tabs={[
              { id: "deposit", label: "Add" },
              { id: "withdraw", label: "Remove" },
            ]}
            activeTab={tab}
            setActiveTab={setTab}
            isPathProvided={false}
            fullWidth
          />
          {tab === "deposit" ? (
            legs.map((l, i) => (
              <Inset key={l.contract}>
                <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <InputBase
                    placeholder="0"
                    value={amounts[i]}
                    onChange={(e) => setLeg(i, e.target.value)}
                    inputProps={{ inputMode: "decimal" }}
                    sx={{ flex: 1, fontSize: "1.5rem", fontWeight: 500, color: "#E3E3E3" }}
                  />
                  <TokenLogo code={l.code} issuer={l.issuer} size="1.5rem" />
                  <Typography variant="subtitle1" color="common.black">
                    {l.code}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="subtitle3" color={Number(amounts[i] || 0) > l.balance ? "error.main" : MODAL.muted}>
                    Balance: {formatAmount(l.balance, 6)}
                  </Typography>
                  {l.balance > 0 && (
                    <ButtonBase onClick={() => setLeg(i, String(Number(l.balance.toFixed(7))))} sx={{ fontSize: "0.75rem", color: "primary.main" }}>
                      MAX
                    </ButtonBase>
                  )}
                </Box>
              </Inset>
            ))
          ) : (
            <Inset>
              <Typography variant="subtitle3" color={MODAL.muted}>
                Your liquidity: {position ? `${(position.legs ?? []).map((l) => `${formatAmount(l.amount, 4)} ${l.code}`).join(" + ")} · ${formatUsd(position.usd)}` : "none"}
              </Typography>
              <Typography variant="h5" color="common.black">
                {pct}%
              </Typography>
              <Slider value={pct} min={1} max={100} onChange={(_, v) => setPct(v as number)} disabled={!position?.shares} />
              <Box sx={{ display: "flex", gap: "0.5rem" }}>
                {[25, 50, 75, 100].map((v) => (
                  <ButtonBase key={v} onClick={() => setPct(v)} sx={{ px: "0.75rem", py: "0.25rem", borderRadius: "999rem", backgroundColor: MODAL.border, fontSize: "0.75rem", color: "#E3E3E3" }}>
                    {v}%
                  </ButtonBase>
                ))}
              </Box>
            </Inset>
          )}
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography variant="subtitle3" color={MODAL.muted}>
              Pool fee · TVL
            </Typography>
            <Typography variant="subtitle3" color="common.black">
              {pool.feeBps != null ? `${(pool.feeBps / 100).toFixed(2)}%` : "—"} · {pool.tvlUsd != null ? formatUsd(pool.tvlUsd) : "—"}
            </Typography>
          </Box>
          <Typography variant="caption" color={MODAL.muted}>
            Deposits follow the pool&apos;s current price ratio; up to 1% slippage protection.
          </Typography>
        </Box>
      </GlassDialog>
      <TxDialog open={txOpen} title={`Liquidity · ${pool.pair}`} steps={steps} error={txError} onClose={() => (setTxOpen(false), onClose())} />
    </>
  );
}

export default function Pools({ tabs }: { tabs: React.ReactNode }) {
  const { activeWallet } = useWallet();
  const portfolio = usePortfolio();
  const { byContract } = useTokenCatalogue();
  const { values, loading } = useSharedMany<{ rows?: PoolRow[] } | null>(
    VENUES.map((v) => `dexpools:${v.id}`),
    (k) => () => apiJson(`/api/dex/pools?protocol=${k.split(":")[1]}`, undefined, 240_000),
    300_000,
  );
  const [venue, setVenue] = useState<"all" | (typeof VENUES)[number]["id"]>("all");
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<{ pool: PoolRow; initial: "deposit" | "withdraw" } | null>(null);

  const all = useMemo(() => VENUES.flatMap((v) => values[`dexpools:${v.id}`]?.rows ?? []), [values]);
  const rows = useMemo(
    () =>
      all
        .filter((p) => (venue === "all" || p.protocol === venue) && (p.tvlUsd ?? 0) >= 100 && (!q || p.pair.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0)),
    [all, venue, q],
  );
  const legsOf = (p: PoolRow) => p.assets.map((a) => ({ code: byContract.get(a.contract)?.code ?? a.code, issuer: byContract.get(a.contract)?.issuer ?? null }));
  const myLp = portfolio.supplied.filter((s) => s.kind === "lp" && s.wallet === activeWallet?.address);

  const columns: Column<PoolRow>[] = [
    {
      id: "pair",
      header: "Pool",
      cell: (p) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <PairLogos legs={legsOf(p)} />
          <Box>
            <Typography variant="body3" color="common.black">
              {p.pair}
            </Typography>
            <Typography variant="caption" color="grey.200">
              {venueName(p.protocol)} · {p.poolType}
            </Typography>
          </Box>
        </Box>
      ),
    },
    { id: "fee", header: "Fee", cell: (p) => <Typography variant="body1" color="black.main100">{p.feeBps != null ? `${(p.feeBps / 100).toFixed(2)}%` : "—"}</Typography> },
    { id: "tvl", header: "TVL", cell: (p) => <Typography variant="body1" color="common.black">{p.tvlUsd != null ? formatUsd(p.tvlUsd) : "—"}</Typography> },
    {
      id: "mine",
      header: "Your liquidity",
      cell: (p) => {
        const m = myLp.find((s) => s.pool === p.address);
        return <Typography variant="body1" color={m ? "green.main" : "grey.200"}>{m ? formatUsd(m.usd) : "—"}</Typography>;
      },
    },
    {
      id: "actions",
      header: "",
      cell: (p) => (
        <Box sx={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <Button size="small" variant="solid" color="primary" onClick={() => setDialog({ pool: p, initial: "deposit" })}>
            Add
          </Button>
          <Button size="small" variant="outlined" color="cancel" disabled={!myLp.some((s) => s.pool === p.address)} onClick={() => setDialog({ pool: p, initial: "withdraw" })}>
            Remove
          </Button>
        </Box>
      ),
    },
  ];

  const main = (
    <>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", mb: "1rem" }}>
        <Box sx={{ display: "flex", gap: "0.5rem" }}>
          <Chip active={venue === "all"} onClick={() => setVenue("all")}>
            All pools
          </Chip>
          {VENUES.map((v) => (
            <Chip key={v.id} active={venue === v.id} onClick={() => setVenue(v.id)}>
              {v.name}
            </Chip>
          ))}
        </Box>
        <Search>
          <Box sx={{ display: "inline-flex", color: "grey.200" }}>
            <SearchIcon size="1rem" />
          </Box>
          <InputBase value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pair" sx={{ fontSize: "0.875rem", color: "common.black" }} />
        </Search>
      </Box>
      <DataTable columns={columns} rows={rows.slice(0, 100)} isLoading={loading && rows.length === 0} emptyDataText="No pools found" getRowId={(p) => `${p.protocol}:${p.address}`} />
    </>
  );

  const side = (
    <>
      <SideCard title="Your liquidity" icon="/assets/topPools.svg">
        {portfolio.lpLoading ? (
          <Typography variant="subtitle3" color="grey.200">
            Scanning pools for your positions…
          </Typography>
        ) : myLp.length === 0 ? (
          <Typography variant="subtitle3" color="grey.200">
            No pool positions yet.
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {myLp.map((s) => {
              const p = all.find((x) => x.address === s.pool);
              return (
                <Box key={s.pool} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <PairLogos legs={s.legs ?? []} size="1.5rem" />
                    <Box>
                      <Typography variant="subtitle1" color="common.black">
                        {s.code}
                      </Typography>
                      <Typography variant="caption" color="grey.200">
                        {s.label} · {formatUsd(s.usd)}
                      </Typography>
                    </Box>
                  </Box>
                  {p && (
                    <Button size="small" variant="outlined" color="cancel" onClick={() => setDialog({ pool: p, initial: "withdraw" })}>
                      Manage
                    </Button>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </SideCard>
      <SideCard title="Largest pools" icon="/assets/newPools.svg">
        <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[...all]
            .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))
            .slice(0, 6)
            .map((p) => (
              <ButtonBase key={`${p.protocol}${p.address}`} onClick={() => setDialog({ pool: p, initial: "deposit" })} sx={{ justifyContent: "space-between", width: "100%" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <PairLogos legs={legsOf(p)} size="1.5rem" />
                  <Typography variant="subtitle1" color="common.black">
                    {p.pair}
                  </Typography>
                </Box>
                <Typography variant="subtitle3" color="grey.200">
                  {venueName(p.protocol)} · {p.tvlUsd != null ? formatUsd(p.tvlUsd) : "—"}
                </Typography>
              </ButtonBase>
            ))}
        </Box>
      </SideCard>
    </>
  );

  return (
    <>
      <EarnGrid tabs={tabs} main={main} side={side} />
      {dialog && (
        <LiquidityDialog
          pool={dialog.pool}
          position={myLp.find((s) => s.pool === dialog.pool.address)}
          initial={dialog.initial}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
