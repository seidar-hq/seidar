import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { LEGAL_LINKS } from "@/lib/links";

export default function Footer() {
  return (
    <Box component="footer" sx={{ mt: "auto", pt: "1rem", pb: "0.5rem", width: "100%", flexShrink: 0 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems="center"
        spacing="0.500rem"
      >
        <Typography variant="subtitle1" sx={{ color: (t) => t.palette.grey[200], textAlign: { xs: "center", sm: "left" } }}>
          Seidar © {new Date().getFullYear()}. All rights reserved.
        </Typography>
        <Stack direction="row" spacing="1rem" justifyContent="center" alignItems="center">
          {LEGAL_LINKS.map((link, i) => (
            <Stack key={link.href} direction="row" spacing="1rem" alignItems="center">
              <Link
                component="a"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                sx={{ color: (t) => t.palette.grey[200] }}
              >
                {link.label}
              </Link>
              {i < LEGAL_LINKS.length - 1 && (
                <Typography variant="subtitle1" sx={{ color: (t) => t.palette.grey[200] }}>
                  |
                </Typography>
              )}
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
