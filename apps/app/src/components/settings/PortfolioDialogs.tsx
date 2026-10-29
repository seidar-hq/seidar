"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useAlerts } from "@/components/common/Alerts";
import GlassDialog, { MODAL } from "@/components/common/GlassDialog";
import { InsetRow, WalletAvatar } from "@/components/wallet/WalletParts";
import { shortAddress } from "@/lib/format";
import { useWallet, walletLabel } from "@/wallet/WalletContext";

const NAME_MAX = 32;

/** Create a portfolio (id null) or rename one. */
export function PortfolioNameDialog({ open, id, onClose }: { open: boolean; id: string | null; onClose: () => void }) {
  const { portfolios, createPortfolio, renamePortfolio } = useWallet();
  const { successAlert } = useAlerts();
  const current = id ? portfolios.find((p) => p.id === id) : null;
  const [name, setName] = useState("");
  const [makeActive, setMakeActive] = useState(true);

  useEffect(() => {
    if (open) setName(current?.name ?? "");
  }, [open, current?.name]);

  const trimmed = name.trim();
  const valid = trimmed.length > 0 && trimmed.length <= NAME_MAX && trimmed !== current?.name;
  const submit = () => {
    if (!valid) return;
    if (current) {
      renamePortfolio(current.id, trimmed);
      successAlert({ message: "Portfolio renamed" });
    } else {
      createPortfolio(trimmed, makeActive);
      successAlert({ message: "Portfolio created" });
    }
    onClose();
  };

  return (
    <GlassDialog
      open={open}
      onClose={onClose}
      title={current ? "Rename Portfolio" : "Add Portfolio"}
      subtitle={current ? undefined : "Group wallets into a portfolio. The dashboard, earn and history follow the active portfolio."}
      primaryLabel={current ? "Save" : "Create Portfolio"}
      primaryDisabled={!valid}
      onPrimary={submit}
    >
      <InsetRow sx={{ flexDirection: "column", alignItems: "stretch", gap: "0.375rem", px: "1rem" }}>
        <Typography variant="subtitle3" color="grey.200">
          Portfolio Name
        </Typography>
        <InputBase
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. Long term"
          inputProps={{ maxLength: NAME_MAX }}
          sx={{ fontSize: "1rem", fontWeight: 500, color: "common.black", "& input": { p: 0 } }}
        />
      </InsetRow>
      {!current && (
        <ButtonBase
          onClick={() => setMakeActive((v) => !v)}
          sx={{ display: "flex", alignItems: "center", gap: "0.625rem", alignSelf: "flex-start", borderRadius: "0.5rem" }}
        >
          <Box
            sx={{
              width: "1.125rem",
              height: "1.125rem",
              borderRadius: "0.3rem",
              border: `0.125rem solid ${makeActive ? "transparent" : MODAL.muted}`,
              backgroundColor: makeActive ? "primary.main" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "common.white",
              fontSize: "0.75rem",
            }}
          >
            {makeActive ? "✓" : ""}
          </Box>
          <Typography variant="body3">Make it the active portfolio</Typography>
        </ButtonBase>
      )}
    </GlassDialog>
  );
}

export function DeletePortfolioDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { portfolios, deletePortfolio } = useWallet();
  const { successAlert } = useAlerts();
  const target = portfolios.find((p) => p.id === id);
  const rest = portfolios.filter((p) => p.id !== id);
  const [moveTo, setMoveTo] = useState<string>("");

  useEffect(() => {
    if (id) setMoveTo(rest[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <GlassDialog
      open={!!target}
      onClose={onClose}
      title="Delete Portfolio"
      subtitle={target ? `“${target.name}” will be deleted.` : undefined}
      primaryLabel="Delete Portfolio"
      primaryDisabled={!target || rest.length === 0}
      onPrimary={() => {
        if (!target) return;
        deletePortfolio(target.id, moveTo);
        successAlert({ message: "Portfolio deleted" });
        onClose();
      }}
    >
      {target && target.wallets.length > 0 && rest.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <Typography variant="subtitle3" color="grey.200">
            Move its {target.wallets.length} wallet{target.wallets.length === 1 ? "" : "s"} to
          </Typography>
          {rest.map((p) => (
            <InsetRow
              key={p.id}
              onClick={() => setMoveTo(p.id)}
              sx={{ cursor: "pointer", border: `0.0625rem solid ${moveTo === p.id ? "#346CFF" : "transparent"}` }}
            >
              <Typography variant="body3" color="common.black" sx={{ flex: 1 }}>
                {p.name}
              </Typography>
              <Typography variant="subtitle3" color="grey.200">
                {p.wallets.length} wallet{p.wallets.length === 1 ? "" : "s"}
              </Typography>
            </InsetRow>
          ))}
        </Box>
      )}
      {rest.length === 0 && <Typography variant="body3">You need at least one portfolio.</Typography>}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
        <InfoOutlinedIcon sx={{ fontSize: "1.125rem", color: "primary.main" }} />
        <Typography variant="body3">Deleting a portfolio never moves funds. Wallets stay linked.</Typography>
      </Box>
    </GlassDialog>
  );
}

export function MoveWalletDialog({ address, onClose }: { address: string | null; onClose: () => void }) {
  const { wallets, portfolios, portfolioOf, moveWallet } = useWallet();
  const { successAlert } = useAlerts();
  const wallet = wallets.find((w) => w.address === address);
  const home = address ? portfolioOf(address) : null;
  const [to, setTo] = useState<string>("");

  useEffect(() => {
    if (address) setTo(home?.id ?? "");
  }, [address, home?.id]);

  return (
    <GlassDialog
      open={!!wallet}
      onClose={onClose}
      title="Move Wallet"
      subtitle="Choose the portfolio this wallet belongs to."
      primaryLabel="Move Wallet"
      primaryDisabled={!wallet || !to || to === home?.id}
      onPrimary={() => {
        if (!wallet) return;
        moveWallet(wallet.address, to);
        successAlert({ message: `Moved to ${portfolios.find((p) => p.id === to)?.name ?? "portfolio"}` });
        onClose();
      }}
    >
      {wallet && (
        <>
          <InsetRow>
            <WalletAvatar walletId={wallet.walletId} peer={wallet.peer} size="2.25rem" />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body3" color="common.black">
                {walletLabel(wallet)}
              </Typography>
              <Typography variant="subtitle3" color="grey.200">
                {shortAddress(wallet.address, 6, 6)}
              </Typography>
            </Box>
          </InsetRow>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {portfolios.map((p) => (
              <InsetRow
                key={p.id}
                onClick={() => setTo(p.id)}
                sx={{ cursor: "pointer", border: `0.0625rem solid ${to === p.id ? "#346CFF" : "transparent"}` }}
              >
                <Typography variant="body3" color="common.black" sx={{ flex: 1 }}>
                  {p.name}
                </Typography>
                <Typography variant="subtitle3" color="grey.200">
                  {p.id === home?.id ? "Current" : `${p.wallets.length} wallet${p.wallets.length === 1 ? "" : "s"}`}
                </Typography>
              </InsetRow>
            ))}
          </Box>
        </>
      )}
    </GlassDialog>
  );
}
