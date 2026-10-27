"use client";

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import Drawer from "@mui/material/Drawer";
import Slider from "@mui/material/Slider";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { kindMeta, protocolMeta } from "@/lib/meta";
import { useAdmin } from "./AdminContext";
import { DEFAULT_ADJUSTMENTS, type Adjustments } from "./adjustments";

const AMBER = "#F59E0B";

function Num({ label, value, onChange, step = 1, negative = false }: { label: string; value: number; onChange: (v: number) => void; step?: number; negative?: boolean }) {
  return (
    <TextField
      label={label}
      type="number"
      size="small"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const v = e.target.value === "" ? 0 : Number(e.target.value);
        if (Number.isFinite(v)) onChange(negative ? v : Math.max(0, v));
      }}
      slotProps={{ htmlInput: { step, min: negative ? undefined : 0 } }}
      sx={{ flex: 1, minWidth: 0 }}
    />
  );
}

function Range({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Typography variant="caption" color="grey.200">
          {label}
        </Typography>
        <Typography variant="caption" color="common.black">
          {fmt ? fmt(value) : value}
        </Typography>
      </Box>
      <Slider size="small" value={value} min={min} max={max} step={step} onChange={(_, v) => onChange(v as number)} />
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem", py: "1rem", borderTop: (t) => `0.0625rem solid ${t.palette.border.main1000}` }}>
      <Typography variant="subtitle2" color="common.black">
        {title}
      </Typography>
      {children}
    </Box>
  );
}

const share = (v: number) => `${Math.round(v * 100)}%`;

export default function AdminPanel() {
  const { unlocked, adjustments, updatedAt, busy, error, open, loginOpen, setOpen, setLoginOpen, login, logout, refresh, save } = useAdmin();
  const [token, setToken] = useState("");
  const [draft, setDraft] = useState<Adjustments>(adjustments ?? DEFAULT_ADJUSTMENTS);

  useEffect(() => {
    if (adjustments) setDraft(adjustments);
  }, [adjustments]);

  useEffect(() => {
    if (!loginOpen) setToken("");
  }, [loginOpen]);

  useEffect(() => {
    if (open && unlocked) void refresh();
  }, [open, unlocked, refresh]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(adjustments ?? DEFAULT_ADJUSTMENTS), [draft, adjustments]);
  const set = (patch: Partial<Adjustments>) => setDraft((cur) => ({ ...cur, ...patch }));
  const mix = (key: "kindMix" | "protocolMix", id: string, v: number) => set({ [key]: { ...draft[key], [id]: v } } as Partial<Adjustments>);

  return (
    <>
      {unlocked && !open && (
        <Button
          onClick={() => setOpen(true)}
          startIcon={<TuneRoundedIcon />}
          sx={{
            position: "fixed",
            right: "1rem",
            bottom: "1rem",
            zIndex: 1500,
            borderRadius: "999rem",
            px: "1rem",
            backgroundColor: "surfaceBg.tableHeader",
            color: "common.black",
            border: `0.0625rem solid ${AMBER}`,
            fontWeight: 700,
            "&:hover": { backgroundColor: "overlay.white08" },
          }}
        >
          Admin
        </Button>
      )}

      <Dialog open={loginOpen} onClose={() => setLoginOpen(false)} slotProps={{ paper: { sx: { backgroundColor: "surfaceBg.main", backgroundImage: "none", borderRadius: "1.25rem", p: "0.5rem", width: "min(22rem, 100vw)" } } }}>
        <Box sx={{ p: "0.75rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <Box>
            <Typography variant="h6" color="common.black">
              Admin access
            </Typography>
            <Typography variant="caption" color="grey.200">
              Enter the analytics admin token to change the live figures.
            </Typography>
          </Box>
          <TextField
            autoFocus
            fullWidth
            size="small"
            type="password"
            label="Admin token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void login(token);
            }}
          />
          {error && (
            <Typography variant="caption" color="error.main">
              {error}
            </Typography>
          )}
          <Button variant="contained" disabled={busy} onClick={() => void login(token)}>
            {busy ? "Checking…" : "Unlock"}
          </Button>
        </Box>
      </Dialog>

      <Drawer
        anchor="right"
        open={open && unlocked}
        onClose={() => setOpen(false)}
        sx={{ "& .MuiDrawer-paper": { width: "min(24rem, 100vw)", backgroundColor: "surfaceBg.main", backgroundImage: "none", p: "1.25rem" } }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="h6" color="common.black">
              Analytics adjustments
            </Typography>
            <Typography variant="caption" color="grey.200">
              Saved to the API; changes apply after Save. Live transactions keep moving the measured base.
            </Typography>
          </Box>
          <Switch checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        </Box>

        <Box sx={{ opacity: draft.enabled ? 1 : 0.45, pointerEvents: draft.enabled ? "auto" : "none" }}>
          <Section title="Volume (USD)">
            <Box sx={{ display: "flex", gap: "0.5rem" }}>
              <Num label="× real" value={draft.volumeX} step={0.1} onChange={(v) => set({ volumeX: Math.min(1000, v) })} />
              <Num label="± added" value={draft.volumeAdd} step={1000} negative onChange={(v) => set({ volumeAdd: v })} />
            </Box>
          </Section>
          <Section title="Transactions">
            <Box sx={{ display: "flex", gap: "0.5rem" }}>
              <Num label="× real" value={draft.txX} step={0.1} onChange={(v) => set({ txX: Math.min(1000, v) })} />
              <Num label="± added" value={draft.txAdd} step={10} negative onChange={(v) => set({ txAdd: Math.round(v) })} />
            </Box>
          </Section>
          <Section title="Wallets">
            <Box sx={{ display: "flex", gap: "0.5rem" }}>
              <Num label="× real" value={draft.walletX} step={0.1} onChange={(v) => set({ walletX: Math.min(1000, v) })} />
              <Num label="± added" value={draft.walletAdd} step={10} negative onChange={(v) => set({ walletAdd: Math.round(v) })} />
            </Box>
            <Range label="Transacting share" value={draft.transactingShare} min={0} max={1} step={0.01} fmt={share} onChange={(v) => set({ transactingShare: v })} />
            <Range label="Active 30d share" value={draft.active30Share} min={0} max={1} step={0.01} fmt={share} onChange={(v) => set({ active30Share: v })} />
            <Range label="Active 7d share" value={draft.active7Share} min={0} max={1} step={0.01} fmt={share} onChange={(v) => set({ active7Share: v })} />
            <Range label="Active today share" value={draft.active1Share} min={0} max={1} step={0.01} fmt={share} onChange={(v) => set({ active1Share: v })} />
          </Section>
          <Section title="History shape">
            <Range label="Spread added amounts over" value={draft.historyDays} min={1} max={90} step={1} fmt={(v) => `${v} days`} onChange={(v) => set({ historyDays: v })} />
            <Range label="Growth curve" value={draft.growth} min={1} max={4} step={0.1} fmt={(v) => (v <= 1.05 ? "flat" : `×${v.toFixed(1)}`)} onChange={(v) => set({ growth: v })} />
            <Range label="Day-to-day variation" value={draft.jitter} min={0} max={1} step={0.05} fmt={share} onChange={(v) => set({ jitter: v })} />
          </Section>
          <Section title="Product mix (weights)">
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              {Object.keys(draft.kindMix).map((k) => (
                <Num key={k} label={kindMeta(k).label} value={draft.kindMix[k]} onChange={(v) => mix("kindMix", k, v)} />
              ))}
            </Box>
          </Section>
          <Section title="Protocol mix (weights)">
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              {Object.keys(draft.protocolMix).map((id) => (
                <Num key={id} label={protocolMeta(id).name} value={draft.protocolMix[id]} onChange={(v) => mix("protocolMix", id, v)} />
              ))}
            </Box>
          </Section>
          <Section title="Recent transactions">
            <Range label="Rows shown (real only)" value={draft.recentRows} min={0} max={25} step={1} onChange={(v) => set({ recentRows: v })} />
          </Section>
        </Box>

        {error && (
          <Typography variant="caption" color="error.main" sx={{ display: "block", mt: "0.75rem" }}>
            {error}
          </Typography>
        )}
        {updatedAt && (
          <Typography variant="caption" color="grey.200" sx={{ display: "block", mt: "0.5rem" }}>
            Last saved {new Date(updatedAt).toLocaleString()}
          </Typography>
        )}
        <Box sx={{ display: "flex", gap: "0.5rem", mt: "0.75rem", alignItems: "center" }}>
          <Button variant="contained" disabled={busy || !dirty} onClick={() => void save(draft)} sx={{ flex: 1 }}>
            {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
          <Button variant="outlined" color="cancel" disabled={busy} onClick={() => void save(DEFAULT_ADJUSTMENTS)}>
            Reset
          </Button>
        </Box>
        <Button variant="text" color="cancel" onClick={logout} sx={{ mt: "0.5rem", alignSelf: "flex-start", px: 0 }}>
          Sign out
        </Button>
      </Drawer>
    </>
  );
}
