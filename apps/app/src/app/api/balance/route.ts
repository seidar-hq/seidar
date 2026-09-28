import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const HORIZON = "https://horizon-testnet.stellar.org";
const PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd";

/** Native XLM balance + USD value for a testnet account. */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address") ?? "";
  if (!/^G[A-Z2-7]{55}$/.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  let xlm = 0;
  try {
    const acct = await fetch(`${HORIZON}/accounts/${address}`, { cache: "no-store" });
    if (acct.ok) {
      const body = await acct.json();
      const native = (body.balances ?? []).find((b: { asset_type: string }) => b.asset_type === "native");
      xlm = Number(native?.balance ?? 0);
    }
  } catch {
    xlm = 0;
  }
  let priceUsd: number | null = null;
  try {
    const p = await fetch(PRICE_URL, { cache: "no-store" });
    if (p.ok) {
      const body = await p.json();
      if (typeof body?.stellar?.usd === "number") priceUsd = body.stellar.usd;
    }
  } catch {
    priceUsd = null;
  }
  return NextResponse.json({
    xlm,
    priceUsd,
    usd: priceUsd === null ? null : xlm * priceUsd,
  });
}
