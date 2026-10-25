"use client";

import { useEffect, useState } from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useSkeletonBg } from "@/hooks/useSkeletonBg";
import { NEWS_FEED_URL } from "@/lib/links";
import { useWallet } from "@/wallet/WalletContext";

type NewsItem = { title: string; link: string; pubDate?: string };

const NewsAccordion = styled(Accordion)(({ theme }) => ({
  width: "100%",
  backgroundColor: theme.palette.surfaceBg.section,
  border: `0.0625rem solid ${theme.palette.border.main1000}`,
  borderRadius: "1.5rem !important",
  overflow: "hidden",
  "&:before": { display: "none" },
}));

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Tue, 20 Oct 2026"
const formatDate = (raw?: string) => {
  if (!raw) return null;
  let d = new Date(raw);
  if (Number.isNaN(d.getTime())) d = new Date(raw.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return null;
  return `${DAYS[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

function useNews() {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(NEWS_FEED_URL);
        const json = await res.json();
        const list: NewsItem[] = (json?.items ?? []).map((i: NewsItem) => ({
          title: i.title,
          link: i.link,
          pubDate: i.pubDate,
        }));
        if (!cancelled) setItems(list);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading };
}

function NewsSkeleton() {
  const bg = useSkeletonBg();
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {Array.from({ length: 7 }).map((_, i) => (
        <Box key={i} sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <Skeleton variant="rounded" height="1.250rem" width="7.500rem" animation="wave" sx={{ background: bg }} />
              <Skeleton variant="rounded" height="1.750rem" width="18.750rem" animation="wave" sx={{ background: bg }} />
            </Box>
            <Skeleton variant="rounded" width="1rem" height="1rem" animation="wave" sx={{ background: bg }} />
          </Box>
          {i < 6 && <Divider />}
        </Box>
      ))}
    </Box>
  );
}

export default function News() {
  const { isConnected } = useWallet();
  const { items, loading } = useNews();

  return (
    <Grid container borderRadius={2} mt="1rem">
      <NewsAccordion elevation={0} expanded>
        <AccordionSummary
          aria-controls="news-content"
          id="news-header"
          sx={{ pointerEvents: "none", padding: "1rem 1rem 0" }}
        >
          <Typography component="span" variant="subtitle2" color="common.black">
            News
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ padding: "1.5rem 1rem 1rem", height: isConnected ? "42.5rem" : "26.0625rem", overflowY: "auto" }}>
          {loading ? (
            <NewsSkeleton />
          ) : items?.length ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {items.map((item, i) => (
                <Box key={item.title} sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                      <Typography variant="caption" color="grey.200">
                        {formatDate(item.pubDate)}
                      </Typography>
                      <Typography variant="body3" color="common.black">
                        {item.title}
                      </Typography>
                    </Box>
                    <Box component="a" href={item.link} target="_blank" rel="noopener noreferrer" sx={{ display: "flex" }}>
                      <OpenInNewIcon sx={{ color: "primary.main", fontSize: "1rem" }} />
                    </Box>
                  </Box>
                  {i < items.length - 1 && <Divider />}
                </Box>
              ))}
            </Box>
          ) : (
            <Typography variant="subtitle1" sx={{ color: "grey.200", textAlign: "center", padding: "4rem 0" }}>
              No news found
            </Typography>
          )}
        </AccordionDetails>
      </NewsAccordion>
    </Grid>
  );
}
