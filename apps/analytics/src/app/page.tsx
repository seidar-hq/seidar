"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Activity from "@/components/Activity";
import { ByProduct, ByProtocol } from "@/components/Breakdown";
import Coverage from "@/components/Coverage";
import { Kpis, StatsBar } from "@/components/Overview";
import Recent from "@/components/Recent";
import { Footer, Header } from "@/components/Shell";
import { SectionHead } from "@/components/ui";
import AdminPanel from "@/admin/AdminPanel";
import { useAdmin } from "@/admin/AdminContext";
import { fetchSummary } from "@/lib/api";
import type { Summary, WindowId } from "@/lib/types";

const REFRESH_MS = 60_000;

export default function Page() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [win, setWin] = useState<WindowId>("all");
  const { revision } = useAdmin();

  useEffect(() => {
    let live = true;
    const load = () =>
      fetchSummary()
        .then((s) => {
          if (!live) return;
          setData(s);
          setError(null);
        })
        .catch((e: Error) => live && setError(e.message));
    void load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [revision]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: "surfaceBg.main",
        backgroundImage: "url(/assets/page-bg.svg)",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
        backgroundSize: "100% 100%",
      }}
    >
      <Header />
      <Box sx={{ maxWidth: "90rem", mx: "auto", px: { xs: "1rem", md: "2.375rem" }, pt: { xs: "4.5rem", sm: "4.75rem" }, pb: "1rem" }}>
        {error && !data && (
          <Alert severity="error" sx={{ mt: "1.25rem" }}>
            {error}
          </Alert>
        )}

        <SectionHead id="coverage" eyebrow="Coverage" title="What Seidar connects to" sub="Live protocol data available through one Seidar interface: markets, pools, vaults and perps across Stellar DeFi." />
        <Coverage data={data} />

        <SectionHead id="usage" eyebrow="Usage" title="Seidar activity" sub="Transactions submitted through Seidar and confirmed on Stellar mainnet." />
        <StatsBar data={data} error={error} win={win} onWin={setWin} />
        <Kpis data={data} win={win} />

        <SectionHead id="activity" eyebrow="Activity" title="Growth over time" />
        <Activity data={data} win={win} />

        <SectionHead id="breakdown" eyebrow="Breakdown" title="Products and protocols" sub="How Seidar is used and where its transactions go on Stellar." />
        <Box sx={{ display: "grid", gap: "1rem", gridTemplateColumns: { xs: "1fr", lg: "1fr 1.25fr" } }}>
          <ByProduct data={data} win={win} />
          <ByProtocol data={data} win={win} />
        </Box>

        <Box sx={{ mt: { xs: "2rem", md: "3rem" } }}>
          <Recent data={data} />
        </Box>

        <Footer />
      </Box>
      <AdminPanel />
    </Box>
  );
}
