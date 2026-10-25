"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import GlassDialog, { MODAL } from "@/components/common/GlassDialog";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import TokenLogo from "@/components/common/TokenLogo";
import TxDialog from "@/components/tx/TxDialog";
import { formatAmount, formatUsd } from "@/lib/format";
import { runBuilt, type TxStep } from "@/lib/tx";
import { useWallet } from "@/wallet/WalletContext";

const AmountBox = styled(Box)({
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  padding: "1rem",
  borderRadius: "1rem",
  backgroundColor: MODAL.inset,
});

const MaxPill = styled(ButtonBase)(({ theme }) => ({
  padding: "0.25rem 0.625rem",
  borderRadius: "999rem",
  fontSize: "0.75rem",
  color: theme.palette.primary.main,
  backgroundColor: "rgba(52, 108, 255, 0.12)",
}));

export type ActionSpec = {
  id: string;
  label: string;
  /** Spendable amount for this action (wallet balance, supplied amount, debt …); null = no fixed cap. */
  available: number | null;
  availableLabel: string;
  /** "max" is allowed (withdraw all / repay all) */
  allowMax?: boolean;
  details?: { label: string; value: string }[];
  /** Build endpoint + body for an amount (decimal string, or "max"). */
  build: (amount: string) => { path: string; body: unknown; label: string };
  disabledReason?: string | null;
};

/**
 * Generic earn action modal: pick an action, enter an amount, then build -> sign -> submit
 * through the API (multi-step builds supported).
 */
export default function ActionDialog({
  open,
  onClose,
  title,
  token,
  price,
  actions,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  token: { code: string; issuer: string | null };
  price: number | null;
  actions: ActionSpec[];
  initial?: string;
}) {
  const { activeWallet } = useWallet();
  const [active, setActive] = useState(initial ?? actions[0]?.id);
  const [amount, setAmount] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [txOpen, setTxOpen] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setActive(initial ?? actions[0]?.id);
      setAmount("");
      setIsMax(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const spec = actions.find((a) => a.id === active) ?? actions[0];
  if (!spec) return null;
  const n = Number(amount);
  const tooMuch = !isMax && spec.available != null && n > spec.available + 1e-9;
  const watchOnly = activeWallet?.walletId === "watch";

  const run = async () => {
    if (!activeWallet) return;
    const { path, body, label } = spec.build(isMax ? "max" : amount);
    setSteps([{ key: "s0", label, status: "building" }]);
    setTxError(null);
    setTxOpen(true);
    try {
      const r = await runBuilt(path, body, activeWallet, setSteps);
      if (!r.unsigned) {
        setAmount("");
        onClose();
      }
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    }
  };

  let cta = spec.label.toUpperCase();
  if (spec.disabledReason) cta = spec.disabledReason;
  else if (!(n > 0) && !isMax) cta = "ENTER AMOUNT";
  else if (tooMuch) cta = "AMOUNT TOO HIGH";

  const tabs: TabItem[] = actions.map((a) => ({ id: a.id, label: a.label }));

  return (
    <>
      <GlassDialog
        open={open && !txOpen}
        onClose={onClose}
        title={title}
        titleIcon={<TokenLogo code={token.code} issuer={token.issuer} size="1.75rem" />}
        actions={
          <Button
            variant="solid"
            color="primary"
            fullWidth
            disabled={cta !== spec.label.toUpperCase()}
            onClick={() => void run()}
            sx={{ height: "3rem", borderRadius: "999rem" }}
          >
            {watchOnly && cta === spec.label.toUpperCase() ? `${cta} (BUILD ONLY)` : cta}
          </Button>
        }
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {actions.length > 1 && <Tabs tabs={tabs} activeTab={spec.id} setActiveTab={(id) => (setActive(id), setAmount(""), setIsMax(false))} isPathProvided={false} fullWidth />}
          <AmountBox>
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <InputBase
                autoFocus
                placeholder="0"
                value={isMax ? "Max" : amount}
                inputProps={{ inputMode: "decimal" }}
                onChange={(e) => {
                  setIsMax(false);
                  if (/^\d*\.?\d*$/.test(e.target.value)) setAmount(e.target.value);
                }}
                sx={{ flex: 1, fontSize: "1.75rem", fontWeight: 500, color: "#E3E3E3" }}
              />
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <TokenLogo code={token.code} issuer={token.issuer} size="1.5rem" />
                <Typography variant="subtitle1" color="common.black">
                  {token.code}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Typography variant="subtitle3" color={tooMuch ? "error.main" : MODAL.muted}>
                  {spec.available == null ? spec.availableLabel : `${spec.availableLabel}: ${formatAmount(spec.available, 6)}`}
                </Typography>
                {spec.available != null && spec.available > 0 && (
                  <MaxPill
                    onClick={() => {
                      if (spec.allowMax) {
                        setIsMax(true);
                        setAmount(String(spec.available));
                      } else setAmount(String(Number(spec.available!.toFixed(7))));
                    }}
                  >
                    MAX
                  </MaxPill>
                )}
              </Box>
              <Typography variant="subtitle3" color={MODAL.muted}>
                ≈{formatUsd(price ? (isMax ? (spec.available ?? 0) : n || 0) * price : 0)}
              </Typography>
            </Box>
          </AmountBox>
          {spec.details?.map((d) => (
            <Box key={d.label} sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="subtitle3" color={MODAL.muted}>
                {d.label}
              </Typography>
              <Typography variant="subtitle3" color="common.black">
                {d.value}
              </Typography>
            </Box>
          ))}
        </Box>
      </GlassDialog>
      <TxDialog
        open={txOpen}
        title={`${spec.label} ${token.code}`}
        steps={steps}
        error={txError}
        onClose={() => setTxOpen(false)}
      />
    </>
  );
}
