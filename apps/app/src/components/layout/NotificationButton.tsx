"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import Grow from "@mui/material/Grow";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Popper from "@mui/material/Popper";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import { apiFetch, apiJson } from "@/lib/api";
import { useWallet } from "@/wallet/WalletContext";

type Note = { id: number; text: string; at: string; read: boolean };

export const NOTES_EVENT = "seidar:notes";

/** Records a notification for `wallet` (best effort; the bell refreshes on success). */
export async function pushNote(wallet: string, text: string) {
  try {
    await apiFetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet, text }),
    });
    window.dispatchEvent(new Event(NOTES_EVENT));
  } catch {}
}

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

/** Header bell: per-wallet notifications from the API (Postgres), unread dot, mark-all-read on open. */
export default function NotificationButton() {
  const theme = useTheme();
  const anchor = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const { address } = useWallet();

  const load = useCallback(async () => {
    if (!address) return setNotes([]);
    const r = await apiJson<{ ok?: boolean; notes?: Note[] }>(`/api/notifications?wallet=${address}`);
    if (r?.ok) setNotes(r.notes ?? []);
  }, [address]);

  // One welcome note per wallet, then poll gently.
  useEffect(() => {
    if (!address) return;
    void apiFetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: address, welcome: true }),
    })
      .catch(() => null)
      .finally(() => void load());
    const t = setInterval(() => void load(), 60_000);
    const onNote = () => void load();
    window.addEventListener(NOTES_EVENT, onNote);
    return () => {
      clearInterval(t);
      window.removeEventListener(NOTES_EVENT, onNote);
    };
  }, [address, load]);

  const unread = notes.filter((n) => !n.read).length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0 && address) {
      void apiFetch("/api/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: address, all: true }),
      }).catch(() => null);
    }
    if (!next) setNotes((ns) => ns.map((n) => ({ ...n, read: true })));
  };

  if (!address) return null;
  const line = theme.palette.mode === "light" ? theme.palette.border.main600 : theme.palette.overlay.white08;

  return (
    <>
      <IconButton
        ref={anchor}
        onClick={toggle}
        aria-label="Notifications"
        sx={{
          width: "2.75rem",
          height: "2.75rem",
          padding: "0.625rem",
          backgroundColor: "overlay.white08",
          borderRadius: "50%",
          borderTop: `0.0625rem solid ${line}`,
          borderBottom: `0.0625rem solid ${line}`,
          flexShrink: 0,
          "&:hover": { backgroundColor: "overlay.white20" },
        }}
      >
        <Badge
          variant="dot"
          invisible={unread === 0}
          sx={{
            "& .MuiBadge-badge": {
              backgroundColor: theme.palette.error.main,
              width: "0.52rem",
              height: "0.52rem",
              borderRadius: "50%",
              top: "0.2rem",
              right: "0.2rem",
            },
          }}
        >
          <NotificationsNoneRoundedIcon sx={{ color: "sidebar.heading", fontSize: "1.375rem" }} />
        </Badge>
      </IconButton>
      <Popper open={open} anchorEl={anchor.current} placement="bottom-end" transition sx={{ zIndex: theme.zIndex.modal + 1 }}>
        {({ TransitionProps }) => (
          <Grow {...TransitionProps} style={{ transformOrigin: "right top" }}>
            <Paper
              sx={{
                mt: "0.5rem",
                width: "22rem",
                backgroundColor: theme.palette.overlay.white08,
                backgroundImage: "none",
                border: `0.0625rem solid ${theme.palette.overlay.white08}`,
                borderRadius: "1.25rem",
                backdropFilter: "blur(2.6875rem)",
                WebkitBackdropFilter: "blur(2.6875rem)",
                boxShadow: `0 0 1.25rem ${theme.palette.shadow.heavy}`,
                overflow: "hidden",
              }}
            >
              <ClickAwayListener
                onClickAway={(e) => {
                  if (!anchor.current?.contains(e.target as Node)) toggle();
                }}
              >
                <Box>
                  <Box
                    sx={{
                      px: "1rem",
                      py: "0.875rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderBottom: `0.0625rem solid ${theme.palette.overlay.white08}`,
                    }}
                  >
                    <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", color: "common.black" }}>Notifications</Typography>
                    {unread > 0 && (
                      <Box sx={{ backgroundColor: "overlay.primary12", borderRadius: "999px", px: "0.5rem", py: "0.125rem" }}>
                        <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: "primary.main" }}>{unread} new</Typography>
                      </Box>
                    )}
                  </Box>
                  <Box sx={{ p: "0.5rem", maxHeight: "24rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {notes.length === 0 ? (
                      <Typography variant="subtitle3" sx={{ color: "grey.200", p: "1rem", textAlign: "center" }}>
                        No notifications yet.
                      </Typography>
                    ) : (
                      notes.map((n) => (
                        <ButtonBase
                          key={n.id}
                          disableRipple
                          sx={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "flex-start",
                            gap: "0.75rem",
                            p: "0.75rem",
                            borderRadius: "0.75rem",
                            textAlign: "left",
                            backgroundColor: n.read ? "transparent" : "overlay.white04",
                            "&:hover": { backgroundColor: "overlay.white04" },
                          }}
                        >
                          <Box
                            sx={{
                              width: "2.25rem",
                              height: "2.25rem",
                              borderRadius: "50%",
                              backgroundColor: "overlay.primary12",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <NotificationsActiveOutlinedIcon sx={{ fontSize: "1.125rem", color: "primary.main" }} />
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontSize: "0.8125rem", lineHeight: 1.5, color: "common.black", wordBreak: "break-word" }}>
                              {n.text}
                            </Typography>
                            <Typography sx={{ fontSize: "0.6875rem", color: "grey.200", mt: "0.25rem" }}>{ago(n.at)}</Typography>
                          </Box>
                          {!n.read && (
                            <Box sx={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", backgroundColor: "primary.main", mt: "0.375rem", flexShrink: 0 }} />
                          )}
                        </ButtonBase>
                      ))
                    )}
                  </Box>
                </Box>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </>
  );
}
