"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

// The small slice of markdown the agent writes: paragraphs, "-"/"1." lists, "#" headings,
// **bold**, *italic*, `code`. Everything is rendered as text (no HTML is ever injected).

function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("**")) out.push(<Box key={k} component="strong" sx={{ fontWeight: 600, color: "common.black" }}>{t.slice(2, -2)}</Box>);
    else if (t.startsWith("`"))
      out.push(
        <Box key={k} component="code" sx={{ fontFamily: "ui-monospace, monospace", fontSize: "0.8125em", px: "0.3rem", py: "0.05rem", borderRadius: "0.3rem", backgroundColor: "surfaceBg.softInsetStrong" }}>
          {t.slice(1, -1)}
        </Box>,
      );
    else out.push(<Box key={k} component="em">{t.slice(1, -1)}</Box>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { kind: "p" | "h" | "ul" | "ol"; lines: string[] };

function blocks(src: string): Block[] {
  const out: Block[] = [];
  for (const raw of src.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const head = /^#{1,4}\s+(.*)$/.exec(line);
    const prev = out[out.length - 1];
    if (!line.trim()) out.push({ kind: "p", lines: [] });
    else if (head) out.push({ kind: "h", lines: [head[1]] });
    else if (bullet) {
      if (prev?.kind === "ul") prev.lines.push(bullet[1]);
      else out.push({ kind: "ul", lines: [bullet[1]] });
    } else if (num) {
      if (prev?.kind === "ol") prev.lines.push(num[1]);
      else out.push({ kind: "ol", lines: [num[1]] });
    }
    else if (prev?.kind === "p" && prev.lines.length) prev.lines.push(line);
    else out.push({ kind: "p", lines: [line] });
  }
  return out.filter((b) => b.lines.length);
}

export default function AgentMarkdown({ text }: { text: string }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem", lineHeight: 1.55, color: "sidebar.subText", wordBreak: "break-word" }}>
      {blocks(text).map((b, i) => {
        const k = `b${i}`;
        if (b.kind === "h")
          return (
            <Typography key={k} sx={{ fontSize: "0.9375rem", fontWeight: 600, color: "common.black" }}>
              {inline(b.lines[0], k)}
            </Typography>
          );
        if (b.kind === "ul" || b.kind === "ol")
          return (
            <Box key={k} component={b.kind} sx={{ m: 0, pl: "1.25rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {b.lines.map((l, j) => (
                <li key={j}>{inline(l, `${k}-${j}`)}</li>
              ))}
            </Box>
          );
        return (
          <Box key={k} component="p" sx={{ m: 0 }}>
            {b.lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(l, `${k}-${j}`)}
              </span>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}
