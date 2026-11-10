"use client";

import { SkulletProvider } from "skullet/react";

// Every loading skeleton in the app is drawn by skullet; this is its look for Seidar's dark UI.
const theme = {
  dark: { base: "rgb(255 255 255 / 0.06)", highlight: "rgb(255 255 255 / 0.09)" },
  animation: "shimmer" as const,
  speed: "slow" as const,
  radius: "0.5rem",
};

export default function SkulletTheme({ children }: { children: React.ReactNode }) {
  return (
    <SkulletProvider mode="dark" theme={theme}>
      {children}
    </SkulletProvider>
  );
}
