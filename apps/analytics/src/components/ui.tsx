"use client";

import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";

/** The app's section card (surfaceBg.section, hairline border, 1.5rem radius). */
export const Card = styled(Box)(({ theme }) => ({
  position: "relative",
  backgroundColor: theme.palette.surfaceBg.section,
  border: `0.0625rem solid ${theme.palette.border.main1000}`,
  borderRadius: "1.5rem",
  padding: "1.25rem",
  minWidth: 0,
  [theme.breakpoints.down("sm")]: { padding: "1rem", borderRadius: "1.25rem" },
}));

export function CardTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", mb: "1rem", flexWrap: "wrap" }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" color="common.black">
          {title}
        </Typography>
        {sub && (
          <Typography variant="caption" color="grey.200" sx={{ display: "block", mt: "0.25rem" }}>
            {sub}
          </Typography>
        )}
      </Box>
      {right}
    </Box>
  );
}

export function SectionHead({ id, eyebrow, title, sub }: { id: string; eyebrow: string; title: string; sub?: string }) {
  return (
    <Box id={id} sx={{ scrollMarginTop: "7rem", mt: { xs: "2rem", md: "3rem" }, mb: "1rem" }}>
      <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "sidebar.purple100" }}>
        {eyebrow}
      </Typography>
      <Typography variant="h5" color="common.black" sx={{ mt: "0.25rem", fontWeight: 600 }}>
        {title}
      </Typography>
      {sub && (
        <Typography variant="body3" color="grey.200" sx={{ display: "block", mt: "0.375rem", maxWidth: "48rem" }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

/** Segmented pill control (same look as the app's tabs). */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <Box sx={{ display: "inline-flex", p: "0.25rem", gap: "0.25rem", borderRadius: "999rem", backgroundColor: "overlay.white04", border: (t) => `0.0625rem solid ${t.palette.border.main1000}` }}>
      {options.map((o) => (
        <Box
          key={o.id}
          component="button"
          type="button"
          onClick={() => onChange(o.id)}
          sx={{
            border: 0,
            cursor: "pointer",
            px: "0.75rem",
            height: "1.875rem",
            borderRadius: "999rem",
            fontFamily: "inherit",
            fontSize: "0.8125rem",
            fontWeight: 500,
            backgroundColor: value === o.id ? "sidebar.primary" : "transparent",
            color: value === o.id ? "#fff" : "grey.200",
            "&:hover": { color: "#fff" },
          }}
        >
          {o.label}
        </Box>
      ))}
    </Box>
  );
}

export function Loading({ h = "1.5rem", w = "60%" }: { h?: string; w?: string }) {
  return <Skeleton variant="rounded" sx={{ height: h, width: w, bgcolor: "overlay.white08", borderRadius: "0.5rem" }} />;
}

export function Empty({ text, h = "16rem" }: { text: string; h?: string }) {
  return (
    <Box sx={{ height: h, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", px: "1rem" }}>
      <Typography variant="body3" color="grey.200">
        {text}
      </Typography>
    </Box>
  );
}
