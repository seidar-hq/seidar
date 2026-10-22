"use client";

import { motion } from "framer-motion";
import Box from "@mui/material/Box";
import { styled } from "@mui/material/styles";
import SectionHeader from "@/components/common/SectionHeader";
import ProtocolBadge from "@/components/common/ProtocolBadge";
import { STELLAR_PROTOCOLS } from "@/lib/protocols";

const Section = styled(Box)(({ theme }) => ({
  width: "100%",
  maxWidth: "1064px",
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  padding: "80px 0",
  gap: "60px",
  [theme.breakpoints.down("lg")]: { padding: "60px 40px", gap: "80px" },
  [theme.breakpoints.down("md")]: { padding: "48px 24px", gap: "60px" },
  [theme.breakpoints.down("sm")]: { padding: "40px 16px", gap: "48px" },
}));

const Group = styled(Box)({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "14px",
  width: "100%",
});

const Grid = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: "8px",
  width: "100%",
  "& > div": { display: "flex", alignItems: "center" },
  [theme.breakpoints.down("md")]: { gridTemplateColumns: "repeat(3, 1fr)" },
  [theme.breakpoints.down("sm")]: { gridTemplateColumns: "repeat(2, 1fr)" },
}));

const rowReveal = {
  hidden: { opacity: 0, y: 20 },
  visible: (row: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.15 * row, duration: 0.5, ease: "easeOut" as const },
  }),
};

export default function Protocols() {
  return (
    <Section>
      <Group>
        <SectionHeader text="Integrated Protocols" bgColor="#346CFF" />
        <Grid>
          {STELLAR_PROTOCOLS.map((protocol, index) => (
            <motion.div
              key={protocol.name}
              custom={Math.floor(index / 5)}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={rowReveal}
            >
              <ProtocolBadge protocol={protocol} />
            </motion.div>
          ))}
        </Grid>
      </Group>
    </Section>
  );
}
