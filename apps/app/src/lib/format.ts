export const shortAddress = (address: string, head = 4, tail = 4) =>
  address.length > head + tail + 3 ? `${address.slice(0, head)}...${address.slice(-tail)}` : address;

const usdFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "$1,234.56"; tiny non-zero values show as "<$0.01". */
export function formatUsd(value: number | null | undefined): string {
  const v = Number(value) || 0;
  if (v > 0 && v < 0.01) return "<$0.01";
  return `$${usdFmt.format(v)}`;
}

/** "$1.2K" / "$3.4M" for tight spaces; plain formatUsd under $1,000. */
export function formatUsdCompact(value: number | null | undefined): string {
  const v = Number(value) || 0;
  if (Math.abs(v) < 1000) return formatUsd(v);
  return `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v)}`;
}

/** Token amounts: up to 6 significant decimals, grouped thousands. */
export function formatAmount(value: number | null | undefined, maxDecimals = 6): string {
  const v = Number(value) || 0;
  if (v === 0) return "0";
  if (Math.abs(v) < 10 ** -maxDecimals) return `<${10 ** -maxDecimals}`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.abs(v) >= 1000 ? 2 : maxDecimals }).format(v);
}
