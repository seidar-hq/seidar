"use client";

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { keyframes, styled } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import Tabs from "@/components/common/Tabs";
import { useWallet } from "@/wallet/WalletContext";
import AgentMarkdown from "./AgentMarkdown";
import { useAgent } from "./AgentContext";
import { useAgentChats, useSavedPrompts, type AgentChat, type SavedPrompt } from "./useAgentChats";

const Root = styled(Box)(({ theme }) => ({
  height: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "0.875rem",
  padding: "1rem",
  borderRadius: "1.25rem",
  backgroundColor: theme.palette.surfaceBg.section,
  border: `0.0625rem solid ${theme.palette.border.main1000}`,
  overflow: "hidden",
}));

const HeadButton = styled(IconButton, { shouldForwardProp: (p) => p !== "active" })<{ active?: boolean }>(({ theme, active }) => ({
  width: "2rem",
  height: "2rem",
  borderRadius: "0.625rem",
  color: theme.palette.sidebar.heading,
  backgroundColor: active ? theme.palette.surfaceBg.pill : theme.palette.surfaceBg.softInset,
  "&:hover": { backgroundColor: theme.palette.surfaceBg.pill },
  "& svg": { fontSize: "1.125rem" },
}));

const Bubble = styled(Box, { shouldForwardProp: (p) => p !== "mine" && p !== "failed" })<{ mine?: boolean; failed?: boolean }>(({ theme, mine, failed }) => ({
  maxWidth: mine ? "85%" : "100%",
  alignSelf: mine ? "flex-end" : "flex-start",
  padding: "0.625rem 0.875rem",
  borderRadius: mine ? "1rem 1rem 0.25rem 1rem" : "1rem 1rem 1rem 0.25rem",
  backgroundColor: mine ? theme.palette.sidebar.primary : theme.palette.surfaceBg.softInset,
  border: failed ? `0.0625rem solid ${theme.palette.error.main}` : "none",
  color: theme.palette.common.black,
}));

const Chip = styled(ButtonBase)(({ theme }) => ({
  justifyContent: "flex-start",
  textAlign: "left",
  width: "100%",
  padding: "0.625rem 0.75rem",
  borderRadius: "0.75rem",
  fontSize: "0.8125rem",
  lineHeight: 1.4,
  color: theme.palette.sidebar.subText,
  backgroundColor: theme.palette.surfaceBg.softInset,
  "&:hover": { backgroundColor: theme.palette.surfaceBg.pill },
}));

const dots = keyframes`0%,80%,100%{opacity:.25}40%{opacity:1}`;

const STARTERS = [
  "Summarise my portfolio and where my money is deployed.",
  "How healthy are my lending positions? How close am I to liquidation?",
  "Which Blend or XOXNO markets pay the most on USDC right now?",
  "Show the best XLM vaults by APY with at least $100k TVL.",
];

const timeAgo = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
};

function AgentMark({ size = "2rem" }: { size?: string }) {
  return (
    <Box sx={{ width: size, height: size, borderRadius: "0.625rem", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #346CFF 0%, #8DE8FF 100%)", flexShrink: 0 }}>
      <AutoAwesomeRoundedIcon sx={{ fontSize: `calc(${size} * 0.55)`, color: "#fff" }} />
    </Box>
  );
}

function Empty({ onPick }: { onPick: (t: string) => void }) {
  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "1.25rem", py: "1rem" }}>
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.625rem", textAlign: "center" }}>
        <AgentMark size="3rem" />
        <Typography sx={{ fontSize: "1.0625rem", fontWeight: 600, color: "common.black" }}>Your Seidar assistant is ready</Typography>
        <Typography sx={{ fontSize: "0.8125rem", color: "grey.200", maxWidth: "17rem" }}>
          Ask about your wallets, positions and Stellar markets. It reads live data and never moves funds.
        </Typography>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {STARTERS.map((s) => (
          <Chip key={s} onClick={() => onPick(s)}>
            {s}
          </Chip>
        ))}
      </Box>
    </Box>
  );
}

function ChatView({ chat, sending, onPick, onRetry }: { chat: AgentChat | null; sending: boolean; onPick: (t: string) => void; onRetry: () => void }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [chat?.messages.length, sending]);
  if (!chat?.messages.length && !sending) return <Empty onPick={onPick} />;
  const last = chat?.messages[chat.messages.length - 1];
  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem", pr: "0.25rem" }}>
      {chat?.messages.map((m, i) => (
        <Bubble key={i} mine={m.role === "user"} failed={m.error}>
          {m.role === "user" ? (
            <Typography sx={{ fontSize: "0.875rem", whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#fff" }}>{m.content}</Typography>
          ) : (
            <AgentMarkdown text={m.content} />
          )}
        </Bubble>
      ))}
      {sending && (
        <Bubble>
          <Box sx={{ display: "flex", gap: "0.3rem", py: "0.3rem" }} aria-label="Agent is thinking">
            {[0, 1, 2].map((d) => (
              <Box key={d} sx={{ width: "0.4rem", height: "0.4rem", borderRadius: "50%", backgroundColor: "grey.200", animation: `${dots} 1.2s ${d * 0.15}s infinite ease-in-out` }} />
            ))}
          </Box>
        </Bubble>
      )}
      {!sending && last?.error && (
        <ButtonBase onClick={onRetry} sx={{ alignSelf: "flex-start", gap: "0.375rem", px: "0.75rem", height: "2rem", borderRadius: "999rem", fontSize: "0.8125rem", color: "sidebar.subText", backgroundColor: "surfaceBg.softInset", "&:hover": { backgroundColor: "surfaceBg.pill" } }}>
          <ReplayRoundedIcon sx={{ fontSize: "1rem" }} />
          Try again
        </ButtonBase>
      )}
      <div ref={end} />
    </Box>
  );
}

function HistoryView({ chats, activeId, onSelect, onDelete }: { chats: AgentChat[]; activeId: string | null; onSelect: (id: string) => void; onDelete: (id: string) => void }) {
  if (!chats.length)
    return (
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography sx={{ fontSize: "0.875rem", color: "grey.200" }}>No chats yet.</Typography>
      </Box>
    );
  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <Typography sx={{ fontSize: "0.75rem", color: "grey.200", textTransform: "uppercase", letterSpacing: "0.06em" }}>Chat history</Typography>
      {chats.map((c) => (
        <Box key={c.id} sx={{ display: "flex", alignItems: "center", gap: "0.5rem", p: "0.5rem 0.5rem 0.5rem 0.75rem", borderRadius: "0.75rem", backgroundColor: c.id === activeId ? "surfaceBg.pill" : "surfaceBg.softInset" }}>
          <ButtonBase onClick={() => onSelect(c.id)} sx={{ flex: 1, minWidth: 0, flexDirection: "column", alignItems: "flex-start", textAlign: "left" }}>
            <Typography noWrap sx={{ width: "100%", fontSize: "0.875rem", color: "common.black" }}>
              {c.title}
            </Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>
              {timeAgo(c.updatedAt)} · {c.messages.length} messages
            </Typography>
          </ButtonBase>
          <Tooltip title="Delete chat" arrow>
            <HeadButton aria-label="Delete chat" onClick={() => onDelete(c.id)}>
              <DeleteOutlineRoundedIcon sx={{ color: "error.main" }} />
            </HeadButton>
          </Tooltip>
        </Box>
      ))}
    </Box>
  );
}

function PromptEditor({ initial, onSave, onCancel }: { initial?: SavedPrompt; onSave: (p: { id?: string; title: string; text: string }) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const field = { width: "100%", px: "0.75rem", py: "0.5rem", borderRadius: "0.75rem", fontSize: "0.875rem", color: "common.black", backgroundColor: "surfaceBg.softInset" };
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <InputBase value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name (optional)" sx={field} inputProps={{ maxLength: 60 }} />
      <InputBase value={text} onChange={(e) => setText(e.target.value)} placeholder="Prompt, e.g. Check my health factors and flag anything under 1.3" multiline minRows={3} maxRows={8} sx={field} inputProps={{ maxLength: 2000 }} />
      <Box sx={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <ButtonBase onClick={onCancel} sx={{ px: "0.875rem", height: "2rem", borderRadius: "999rem", fontSize: "0.8125rem", color: "sidebar.subText", backgroundColor: "surfaceBg.softInset" }}>
          Cancel
        </ButtonBase>
        <ButtonBase disabled={!text.trim()} onClick={() => onSave({ id: initial?.id, title, text })} sx={{ px: "0.875rem", height: "2rem", borderRadius: "999rem", fontSize: "0.8125rem", fontWeight: 600, color: "#fff", backgroundColor: "sidebar.primary", "&.Mui-disabled": { opacity: 0.4 } }}>
          Save prompt
        </ButtonBase>
      </Box>
    </Box>
  );
}

function PromptsView({ onRun }: { onRun: (text: string) => void }) {
  const { prompts, upsert, remove } = useSavedPrompts();
  const [editing, setEditing] = useState<SavedPrompt | "new" | null>(null);
  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
      {editing ? (
        <PromptEditor
          initial={editing === "new" ? undefined : editing}
          onCancel={() => setEditing(null)}
          onSave={(p) => {
            upsert(p);
            setEditing(null);
          }}
        />
      ) : (
        <ButtonBase onClick={() => setEditing("new")} sx={{ gap: "0.375rem", height: "2.5rem", borderRadius: "0.75rem", fontSize: "0.8125rem", fontWeight: 600, color: "#fff", backgroundColor: "sidebar.primary" }}>
          <AddRoundedIcon sx={{ fontSize: "1.125rem" }} />
          {prompts.length ? "New prompt" : "Add your first prompt"}
        </ButtonBase>
      )}
      {!prompts.length && !editing && (
        <Typography sx={{ fontSize: "0.8125rem", color: "grey.200", textAlign: "center", mt: "0.5rem" }}>
          Save the questions you ask often and run them in one click. Prompts stay in this browser.
        </Typography>
      )}
      {prompts.map((p) => (
        <Box key={p.id} sx={{ display: "flex", alignItems: "center", gap: "0.5rem", p: "0.625rem 0.5rem 0.625rem 0.75rem", borderRadius: "0.75rem", backgroundColor: "surfaceBg.softInset" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: "0.875rem", color: "common.black" }}>
              {p.title}
            </Typography>
            <Typography noWrap sx={{ fontSize: "0.75rem", color: "grey.200" }}>
              {p.text}
            </Typography>
          </Box>
          <Tooltip title="Run" arrow>
            <HeadButton aria-label="Run prompt" onClick={() => onRun(p.text)}>
              <PlayArrowRoundedIcon sx={{ color: "green.main" }} />
            </HeadButton>
          </Tooltip>
          <Tooltip title="Edit" arrow>
            <HeadButton aria-label="Edit prompt" onClick={() => setEditing(p)}>
              <EditOutlinedIcon />
            </HeadButton>
          </Tooltip>
          <Tooltip title="Delete" arrow>
            <HeadButton aria-label="Delete prompt" onClick={() => remove(p.id)}>
              <DeleteOutlineRoundedIcon sx={{ color: "error.main" }} />
            </HeadButton>
          </Tooltip>
        </Box>
      ))}
    </Box>
  );
}

function InputBar({ onSend, disabled }: { onSend: (t: string) => void; disabled: boolean }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText("");
  };
  return (
    <Box sx={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", p: "0.5rem 0.5rem 0.5rem 0.875rem", borderRadius: "1rem", backgroundColor: "surfaceBg.softInset", border: (t) => `0.0625rem solid ${t.palette.surfaceBg.softInsetStrong}` }}>
      <InputBase
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask about your portfolio or Stellar markets…"
        multiline
        maxRows={6}
        inputProps={{ maxLength: 4000, "aria-label": "Message the agent" }}
        sx={{ flex: 1, py: "0.375rem", fontSize: "0.875rem", color: "common.black" }}
      />
      <IconButton
        aria-label="Send"
        onClick={submit}
        disabled={disabled || !text.trim()}
        sx={{ width: "2.25rem", height: "2.25rem", flexShrink: 0, backgroundColor: "sidebar.primary", color: "#fff", "&:hover": { backgroundColor: "primary.main" }, "&.Mui-disabled": { backgroundColor: "surfaceBg.pill", color: "grey.200" } }}
      >
        <ArrowUpwardRoundedIcon sx={{ fontSize: "1.125rem" }} />
      </IconButton>
    </Box>
  );
}

/** The Seidar Agent: chat over the user's live Stellar data, with saved one-click prompts. */
export default function AgentPanel() {
  const { setOpen } = useAgent();
  const { address, portfolioAddresses } = useWallet();
  const { chats, active, sending, send, newChat, selectChat, deleteChat, retry } = useAgentChats(address ?? null, portfolioAddresses);
  const [tab, setTab] = useState("chat");
  const [history, setHistory] = useState(false);

  const ask = (t: string, fresh = false) => {
    setHistory(false);
    setTab("chat");
    void send(t, fresh ? "new" : undefined);
  };

  return (
    <Root>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
        <AgentMark />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: "common.black", lineHeight: 1.2 }}>Seidar Agent</Typography>
          <Typography noWrap sx={{ fontSize: "0.75rem", color: "grey.200" }}>
            {history ? "Chat history" : active?.title ?? "New chat"}
          </Typography>
        </Box>
        <Tooltip title="New chat" arrow>
          <HeadButton
            aria-label="New chat"
            onClick={() => {
              newChat();
              setHistory(false);
              setTab("chat");
            }}
          >
            <AddRoundedIcon />
          </HeadButton>
        </Tooltip>
        <Tooltip title="Chat history" arrow>
          <HeadButton aria-label="Chat history" active={history} onClick={() => setHistory((v) => !v)}>
            <HistoryRoundedIcon />
          </HeadButton>
        </Tooltip>
        <Tooltip title="Close" arrow>
          <HeadButton aria-label="Close agent" onClick={() => setOpen(false)}>
            <CloseRoundedIcon />
          </HeadButton>
        </Tooltip>
      </Box>

      {history ? (
        <HistoryView
          chats={chats}
          activeId={active?.id ?? null}
          onSelect={(id) => {
            selectChat(id);
            setHistory(false);
            setTab("chat");
          }}
          onDelete={deleteChat}
        />
      ) : (
        <>
          <Tabs
            tabs={[
              { id: "chat", label: "Chat" },
              { id: "prompts", label: "Prompts" },
            ]}
            activeTab={tab}
            setActiveTab={setTab}
            isPathProvided={false}
            fullWidth
          />
          {tab === "chat" ? <ChatView chat={active} sending={sending} onPick={(t) => ask(t)} onRetry={retry} /> : <PromptsView onRun={(t) => ask(t, true)} />}
        </>
      )}

      {!history && tab === "chat" && <InputBar onSend={(t) => ask(t)} disabled={sending} />}
      <Typography sx={{ fontSize: "0.6875rem", color: "grey.200", textAlign: "center", mt: "-0.25rem" }}>
        Read-only · it never signs or sends transactions · answers can be wrong
      </Typography>
    </Root>
  );
}
