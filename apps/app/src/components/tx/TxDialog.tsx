"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import GlassDialog from "@/components/common/GlassDialog";
import { useAlerts } from "@/components/common/Alerts";
import { explorerTx, readableError, type TxStep } from "@/lib/tx";

const STATUS_TEXT: Record<TxStep["status"], string> = {
  queued: "Waiting",
  building: "Preparing transaction…",
  signing: "Confirm in your wallet…",
  sending: "Submitting to Stellar…",
  confirming: "Checking Stellar for the result…",
  submitted: "Submitted. Not confirmed yet: the explorer link shows the result, and balances update once it lands.",
  done: "Confirmed",
  failed: "Failed",
  unsigned: "Built (watch-only wallet, not signed)",
};

const labUrl = (xdr: string) =>
  `https://laboratory.stellar.org/#txsigner?xdr=${encodeURIComponent(xdr)}&network=public`;

/** Step-by-step progress for one or more transactions, with explorer links on success. */
export default function TxDialog({
  open,
  title,
  steps,
  error,
  onClose,
}: {
  open: boolean;
  title: string;
  steps: TxStep[];
  error?: string | null;
  onClose: () => void;
}) {
  const { successAlert } = useAlerts();
  const busy = steps.some((s) => ["building", "signing", "sending", "confirming"].includes(s.status));

  return (
    <GlassDialog
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      hideClose={busy}
      actions={
        <Button variant="solid" color="connect" size="small" onClick={onClose} disabled={busy}>
          {busy ? "Working…" : "Close"}
        </Button>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {steps.map((s, i) => (
          <Box
            key={s.key}
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              p: "0.875rem",
              borderRadius: "0.75rem",
              backgroundColor: "surfaceBg.softInset",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {s.status === "done" ? (
                <CheckCircleRoundedIcon sx={{ color: "green.main" }} />
              ) : s.status === "failed" ? (
                <ErrorRoundedIcon sx={{ color: "error.main" }} />
              ) : s.status === "unsigned" ? (
                <VisibilityOutlinedIcon sx={{ color: "primary.main" }} />
              ) : s.status === "submitted" ? (
                <HourglassTopRoundedIcon sx={{ color: "warning.main" }} />
              ) : (
                <CircularProgress size={20} />
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle1" color="common.black" sx={{ overflowWrap: "anywhere" }}>
                  {steps.length > 1 ? `${i + 1}. ` : ""}
                  {s.label}
                </Typography>
                <Typography variant="subtitle3" color={s.status === "failed" ? "error.main" : "grey.200"} sx={{ display: "block", overflowWrap: "anywhere" }}>
                  {s.status === "failed" && s.error ? s.error : STATUS_TEXT[s.status]}
                </Typography>
              </Box>
            </Box>
            {s.hash && (
              <Link href={explorerTx(s.hash)} target="_blank" rel="noopener" variant="subtitle3">
                View on Stellar Expert
              </Link>
            )}
            {s.status === "unsigned" && s.xdr && (
              <Box sx={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <Link
                  component="button"
                  variant="subtitle3"
                  onClick={() =>
                    void navigator.clipboard?.writeText(s.xdr!).then(() => successAlert({ message: "Transaction XDR copied" }))
                  }
                >
                  Copy XDR
                </Link>
                <Link href={labUrl(s.xdr)} target="_blank" rel="noopener" variant="subtitle3">
                  Inspect in Stellar Laboratory
                </Link>
              </Box>
            )}
          </Box>
        ))}
        {error && !steps.some((s) => s.status === "failed") && (
          <Typography variant="subtitle3" color="error.main" sx={{ display: "block", overflowWrap: "anywhere" }}>
            {readableError(error)}
          </Typography>
        )}
      </Box>
    </GlassDialog>
  );
}
