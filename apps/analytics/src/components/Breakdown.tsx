"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { int, pct, usd } from "@/lib/format";
import { kindMeta, protocolMeta } from "@/lib/meta";
import type { Summary, WindowId } from "@/lib/types";
import { Card, CardTitle, Empty, Loading, Segmented } from "./ui";

type By = "volume" | "txs";

export function ByProduct({ data, win }: { data: Summary | null; win: WindowId }) {
  const [by, setBy] = useState<By>("volume");
  const rows = (data?.windows?.[win]?.byKind ?? []).map((r) => ({ ...r, v: by === "volume" ? r.volumeUsd : r.txs })).filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
  const total = rows.reduce((s, r) => s + r.v, 0);
  return (
    <Card>
      <CardTitle
        title="By product"
        sub="Which parts of Seidar people use"
        right={<Segmented<By> value={by} onChange={setBy} options={[{ id: "volume", label: "Volume" }, { id: "txs", label: "Transactions" }]} />}
      />
      <Box sx={{ position: "relative" }}>
        {!data ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {[0, 1, 2, 3].map((i) => (
              <Loading key={i} h="2.25rem" w="100%" />
            ))}
          </Box>
        ) : !rows.length ? (
          <Empty h="12rem" text="No transactions in this period yet." />
        ) : (
          <>
            {/* Stacked share bar */}
            <Box sx={{ display: "flex", height: "0.625rem", borderRadius: "999rem", overflow: "hidden", mb: "1.25rem", backgroundColor: "overlay.white04" }}>
              {rows.map((r) => (
                <Box key={r.kind} sx={{ width: `${(r.v / total) * 100}%`, backgroundColor: kindMeta(r.kind).color }} />
              ))}
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              {rows.map((r) => (
                <Box key={r.kind}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", mb: "0.375rem" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                      <Box sx={{ width: "0.625rem", height: "0.625rem", borderRadius: "0.1875rem", backgroundColor: kindMeta(r.kind).color, flexShrink: 0 }} />
                      <Typography variant="body3" color="common.black" noWrap>
                        {kindMeta(r.kind).label}
                      </Typography>
                    </Box>
                    <Typography variant="body3" color="grey.200" sx={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                      {by === "volume" ? usd(r.v) : int(r.v)} · {pct(r.v, total)}
                    </Typography>
                  </Box>
                  <Box sx={{ height: "0.375rem", borderRadius: "999rem", backgroundColor: "overlay.white04" }}>
                    <Box sx={{ height: "100%", width: `${Math.max(2, (r.v / rows[0].v) * 100)}%`, borderRadius: "999rem", backgroundColor: kindMeta(r.kind).color }} />
                  </Box>
                </Box>
              ))}
            </Box>
          </>
        )}
      </Box>
    </Card>
  );
}

export function ByProtocol({ data, win }: { data: Summary | null; win: WindowId }) {
  const rows = [...(data?.windows?.[win]?.byProtocol ?? [])].filter((r) => r.txs > 0).sort((a, b) => b.volumeUsd - a.volumeUsd || b.txs - a.txs);
  const totalVol = rows.reduce((s, r) => s + r.volumeUsd, 0);
  const cell = { py: "0.75rem", borderBottom: (t: { palette: { border: { main1000: string } } }) => `0.0625rem solid ${t.palette.border.main1000}` };
  return (
    <Card>
      <CardTitle title="By protocol" sub="Where Seidar routes activity on Stellar" />
      <Box sx={{ position: "relative", overflowX: "auto" }}>
        {!data ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {[0, 1, 2, 3].map((i) => (
              <Loading key={i} h="2.25rem" w="100%" />
            ))}
          </Box>
        ) : !rows.length ? (
          <Empty h="12rem" text="No transactions in this period yet." />
        ) : (
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", minWidth: "26rem" }}>
            <Box component="thead">
              <Box component="tr">
                {["Protocol", "Transactions", "Volume", "Share"].map((h, i) => (
                  <Box component="th" key={h} sx={{ ...cell, pt: 0, textAlign: i ? "right" : "left", fontSize: "0.75rem", fontWeight: 500, color: "grey.200" }}>
                    {h}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {rows.map((r) => {
                const m = protocolMeta(r.protocol);
                return (
                  <Box component="tr" key={r.protocol}>
                    <Box component="td" sx={cell}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                        <Box component="img" src={m.logo} alt="" sx={{ width: "1.75rem", height: "1.75rem", borderRadius: "50%", objectFit: "cover", backgroundColor: "overlay.white08" }} />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body3" color="common.black" noWrap sx={{ display: "block" }}>
                            {m.name}
                          </Typography>
                          <Typography variant="caption" color="grey.200" noWrap sx={{ display: "block" }}>
                            {m.category}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                    <Box component="td" sx={{ ...cell, textAlign: "right", fontSize: "0.875rem", color: "common.black" }}>
                      {int(r.txs)}
                    </Box>
                    <Box component="td" sx={{ ...cell, textAlign: "right", fontSize: "0.875rem", color: "common.black" }}>
                      {usd(r.volumeUsd)}
                    </Box>
                    <Box component="td" sx={{ ...cell, textAlign: "right", fontSize: "0.875rem", color: "grey.200" }}>
                      {pct(r.volumeUsd, totalVol)}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}
      </Box>
    </Card>
  );
}
