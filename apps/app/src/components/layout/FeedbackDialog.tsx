"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { useAlerts } from "@/components/common/Alerts";
import GlassDialog, { MODAL } from "@/components/common/GlassDialog";
import { InsetRow } from "@/components/wallet/WalletParts";
import { apiFetch } from "@/lib/api";
import { useWallet } from "@/wallet/WalletContext";

// Feedback form: a message, an optional reply address and up to 4 images (2 MB in all).
// The API emails it to the team (hello@seidar.xyz's inbox).

const MAX_FILES = 4;
const MAX_BYTES = 2 * 1024 * 1024;
const TEXT_MAX = 4000;
const TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

type Picked = { id: string; name: string; type: string; size: number; dataUrl: string };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n >= 1024 * 1024 ? 1 : 2)} MB`;

const readDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

export default function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { activeWallet } = useWallet();
  const { successAlert } = useAlerts();
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const total = files.reduce((s, f) => s + f.size, 0);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const add = async (list: FileList | File[]) => {
    setError(null);
    const next = [...files];
    let size = total;
    for (const f of Array.from(list)) {
      if (!TYPES.includes(f.type)) {
        setError(`${f.name} isn't a PNG, JPEG, GIF or WebP image.`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        setError(`You can attach up to ${MAX_FILES} images.`);
        break;
      }
      if (size + f.size > MAX_BYTES) {
        setError(`Images can be 2 MB in total; ${f.name} would go over.`);
        continue;
      }
      try {
        next.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: f.name, type: f.type, size: f.size, dataUrl: await readDataUrl(f) });
        size += f.size;
      } catch {
        setError(`Couldn't read ${f.name}.`);
      }
    }
    setFiles(next);
  };

  const reset = () => {
    setText("");
    setEmail("");
    setFiles([]);
    setError(null);
  };

  const close = () => {
    if (!sending) onClose();
  };

  const submit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await apiFetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          email: email.trim(),
          wallet: activeWallet?.walletId === "watch" ? "" : (activeWallet?.address ?? ""),
          page: pathname,
          files: files.map(({ name, type, dataUrl }) => ({ name, type, dataUrl })),
        }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!j?.ok) {
        setError(
          j?.error === "feedback-not-configured"
            ? "Feedback isn't switched on for this server yet."
            : (j?.error ?? `Couldn't send your feedback (HTTP ${r.status}).`),
        );
        return;
      }
      reset();
      onClose();
      successAlert({ message: "Thanks! Your feedback was sent." });
    } catch {
      setError("Couldn't reach the Seidar API. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <GlassDialog
      open={open}
      onClose={close}
      title="Send Feedback"
      subtitle="Tell us what's working, what's broken or what you'd like to see. Screenshots help."
      primaryLabel={sending ? "Sending…" : "Send Feedback"}
      primaryStartIcon={sending ? <CircularProgress size="0.875rem" sx={{ color: "inherit" }} /> : undefined}
      primaryDisabled={!text.trim() || sending}
      cancelDisabled={sending}
      onPrimary={submit}
      maxWidth="32rem"
    >
      <InsetRow sx={{ flexDirection: "column", alignItems: "stretch", gap: "0.375rem", px: "1rem" }}>
        <Typography variant="subtitle3" color="grey.200">
          Your feedback
        </Typography>
        <InputBase
          autoFocus
          multiline
          minRows={4}
          maxRows={10}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, TEXT_MAX))}
          onPaste={(e) => {
            const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
            if (imgs.length) {
              e.preventDefault();
              void add(imgs);
            }
          }}
          placeholder="What happened, and what did you expect?"
          sx={{ color: "common.black", fontSize: "0.9375rem", lineHeight: 1.5, p: 0 }}
        />
        <Typography variant="subtitle3" color="grey.200" sx={{ alignSelf: "flex-end", fontSize: "0.75rem" }}>
          {text.length}/{TEXT_MAX}
        </Typography>
      </InsetRow>

      <InsetRow sx={{ flexDirection: "column", alignItems: "stretch", gap: "0.375rem", px: "1rem" }}>
        <Typography variant="subtitle3" color="grey.200">
          Email for a reply (optional)
        </Typography>
        <InputBase
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value.slice(0, 200))}
          placeholder="you@example.com"
          sx={{ color: "common.black", fontSize: "0.9375rem", p: 0 }}
        />
      </InsetRow>

      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Typography variant="subtitle3" color="grey.200">
            Images (optional)
          </Typography>
          <Typography variant="subtitle3" color={total > MAX_BYTES * 0.9 ? "orange.main" : "grey.200"} sx={{ fontSize: "0.75rem" }}>
            {files.length}/{MAX_FILES} · {mb(total)} of 2 MB
          </Typography>
        </Box>
        {files.length < MAX_FILES && (
          <ButtonBase
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void add(e.dataTransfer.files);
            }}
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: "0.375rem",
              py: "1.25rem",
              borderRadius: "1rem",
              border: `0.0625rem dashed ${dragging ? "#5E93FF" : MODAL.border}`,
              backgroundColor: dragging ? MODAL.insetHover : MODAL.inset,
              "&:hover": { backgroundColor: MODAL.insetHover },
            }}
          >
            <AddPhotoAlternateOutlinedIcon sx={{ fontSize: "1.5rem", color: "grey.200" }} />
            <Typography variant="subtitle3" color="common.black">
              Add images
            </Typography>
            <Typography variant="subtitle3" color="grey.200" sx={{ fontSize: "0.75rem" }}>
              Click, drop or paste · PNG, JPEG, GIF, WebP · up to 2 MB in total
            </Typography>
          </ButtonBase>
        )}
        <input
          ref={input}
          type="file"
          accept={TYPES.join(",")}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void add(e.target.files);
            e.target.value = "";
          }}
        />
        {files.length > 0 && (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
            {files.map((f) => (
              <Box key={f.id} title={`${f.name} · ${mb(f.size)}`} sx={{ position: "relative", aspectRatio: "1", borderRadius: "0.75rem", overflow: "hidden", backgroundColor: MODAL.inset }}>
                <Box component="img" src={f.dataUrl} alt={f.name} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <IconButton
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                  disabled={sending}
                  sx={{ position: "absolute", top: "0.25rem", right: "0.25rem", width: "1.5rem", height: "1.5rem", p: 0, color: "#fff", backgroundColor: "rgba(0,0,0,0.6)", "&:hover": { backgroundColor: "rgba(0,0,0,0.8)" } }}
                >
                  <CloseRoundedIcon sx={{ fontSize: "1rem" }} />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {error && (
        <Typography variant="subtitle3" color="error.main">
          {error}
        </Typography>
      )}
    </GlassDialog>
  );
}
