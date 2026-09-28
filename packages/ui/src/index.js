// @seidar/ui — shared theme tokens. Landing black (#000) is canonical
// across seidar.xyz + app.seidar.xyz + docs.seidar.xyz.

export const theme = Object.freeze({
  black: "#000000",
  panel: "#0a0a0a",
  border: "#1d1d1d",
  borderStrong: "#282828",
  text: "#f7f7f7",
  muted: "#8a8a91",
  blue: "#3b82f6",
  blueHover: "#2f6fe0",
  green: "#57c36b",
  amber: "#ffad15",
  red: "#e66b6b",
  sidebarW: 60,
  sidebarWOpen: 212,
  topbarH: 52,
});

export function healthColor(health, liqThreshold = 15000) {
  if (health === null) return theme.muted;
  if (health >= liqThreshold + 1000) return theme.green;
  if (health >= liqThreshold - 2500) return theme.amber;
  return theme.red;
}
