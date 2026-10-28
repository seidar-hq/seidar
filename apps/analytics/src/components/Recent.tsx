"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import { explorerTx } from "@/lib/api";
import { ago, shortHash, usd } from "@/lib/format";
import { kindMeta, protocolMeta } from "@/lib/meta";
import type { Summary } from "@/lib/types";
import { Card, CardTitle, Empty, Loading } from "./ui";

export default function Recent({ data }: { data: Summary | null }) {
  const rows = data?.recent ?? [];
  const cell = { py: "0.75rem", px: "0.5rem", borderBottom: (t: { palette: { border: { main1000: string } } }) => `0.0625rem solid ${t.palette.border.main1000}`, whiteSpace: "nowrap" as const };
  return (
    <Card>
      <CardTitle title="Latest transactions" sub="The most recent confirmed transactions submitted through Seidar. Open any of them on Stellar Expert." />
      <Box sx={{ overflowX: "auto" }}>
        {!data ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Loading key={i} h="2rem" w="100%" />
            ))}
          </Box>
        ) : !rows.length ? (
          <Empty h="10rem" text="No transactions recorded yet." />
        ) : (
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", minWidth: "40rem" }}>
            <Box component="thead">
              <Box component="tr">
                {["When", "Wallet", "Product", "Protocol", "Value", "Transaction"].map((h, i) => (
                  <Box component="th" key={h} sx={{ ...cell, pt: 0, textAlign: i >= 4 ? "right" : "left", fontSize: "0.75rem", fontWeight: 500, color: "grey.200" }}>
                    {h}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {rows.map((r) => {
                const p = protocolMeta(r.protocol);
                const k = kindMeta(r.kind);
                return (
                  <Box component="tr" key={r.hash}>
                    <Box component="td" sx={{ ...cell, fontSize: "0.875rem", color: "grey.200" }}>
                      {ago(r.at)}
                    </Box>
                    <Box component="td" sx={{ ...cell, fontFamily: "monospace", fontSize: "0.8125rem", color: "grey.200" }}>
                      {r.account ? shortHash(r.account) : "—"}
                    </Box>
                    <Box component="td" sx={cell}>
                      <Box sx={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", px: "0.5rem", height: "1.5rem", borderRadius: "999rem", backgroundColor: "overlay.white04" }}>
                        <Box sx={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", backgroundColor: k.color }} />
                        <Typography sx={{ fontSize: "0.8125rem", color: "common.black" }}>{k.label}</Typography>
                      </Box>
                    </Box>
                    <Box component="td" sx={cell}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Box component="img" src={p.logo} alt="" sx={{ width: "1.25rem", height: "1.25rem", borderRadius: "50%", objectFit: "cover" }} />
                        <Typography sx={{ fontSize: "0.875rem", color: "common.black" }}>{p.name}</Typography>
                      </Box>
                    </Box>
                    <Box component="td" sx={{ ...cell, textAlign: "right", fontSize: "0.875rem", color: "common.black" }}>
                      {r.volumeUsd > 0 ? usd(r.volumeUsd, false) : "—"}
                    </Box>
                    <Box component="td" sx={{ ...cell, textAlign: "right" }}>
                      <Box
                        component="a"
                        href={explorerTx(r.hash)}
                        target="_blank"
                        rel="noopener"
                        sx={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontFamily: "monospace", fontSize: "0.8125rem", color: "sidebar.purple100", "&:hover": { textDecoration: "underline" } }}
                      >
                        {shortHash(r.hash)}
                        <OpenInNewRoundedIcon sx={{ fontSize: "0.875rem" }} />
                      </Box>
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
