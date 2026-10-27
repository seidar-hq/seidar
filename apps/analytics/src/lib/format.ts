export function usd(n: number | null | undefined, compact = true): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (compact && Math.abs(n) >= 1000) {
    return "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
  }
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: n < 100 ? 2 : 0, maximumFractionDigits: 2 });
}

export function int(n: number | null | undefined, compact = false): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (compact && Math.abs(n) >= 10_000) return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  return Math.round(n).toLocaleString("en-US");
}

export const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0)}%` : "0%");

export function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function longDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const shortHash = (h: string) => (h.length > 14 ? `${h.slice(0, 6)}…${h.slice(-6)}` : h);
