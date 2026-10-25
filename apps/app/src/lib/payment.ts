"use client";

// Classic Stellar payment, built in the browser and signed by the wallet. Checks the recipient
// first: an unfunded account can only receive XLM (as create_account), and issued assets need
// a trustline on the recipient.

const HORIZON = "https://horizon.stellar.org";

type HorizonAccount = { balances?: { asset_type: string; asset_code?: string; asset_issuer?: string }[] };

async function loadAccount(address: string): Promise<HorizonAccount | null> {
  const r = await fetch(`${HORIZON}/accounts/${address}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Could not reach Horizon. Try again.");
  return (await r.json()) as HorizonAccount;
}

export async function buildPayment(p: {
  from: string;
  to: string;
  code: string;
  issuer: string | null;
  amount: string;
  memo?: string;
}): Promise<string> {
  const sdk = await import("@stellar/stellar-sdk");
  if (!sdk.StrKey.isValidEd25519PublicKey(p.to)) throw new Error("Recipient is not a valid Stellar address (G…).");
  if (p.to === p.from) throw new Error("Recipient is the same as your wallet.");
  const native = !p.issuer && p.code === "XLM";
  const dest = await loadAccount(p.to);
  if (!dest && !native) throw new Error("The recipient account does not exist yet. Only XLM can be sent to a new account.");
  if (!dest && Number(p.amount) < 1) throw new Error("A new account needs at least 1 XLM to be created.");
  if (dest && !native && !dest.balances?.some((b) => b.asset_code === p.code && b.asset_issuer === p.issuer))
    throw new Error(`The recipient has no trustline for ${p.code}, so they cannot receive it yet.`);

  const server = new sdk.Horizon.Server(HORIZON);
  const source = await server.loadAccount(p.from);
  const asset = native ? sdk.Asset.native() : new sdk.Asset(p.code, p.issuer!);
  const op = dest
    ? sdk.Operation.payment({ destination: p.to, asset, amount: p.amount })
    : sdk.Operation.createAccount({ destination: p.to, startingBalance: p.amount });
  const fee = await server.fetchBaseFee().catch(() => 100);
  const tx = new sdk.TransactionBuilder(source, { fee: String(Math.max(fee, 100)), networkPassphrase: sdk.Networks.PUBLIC })
    .addOperation(op)
    .setTimeout(180);
  if (p.memo?.trim()) tx.addMemo(sdk.Memo.text(p.memo.trim().slice(0, 28)));
  return tx.build().toXDR();
}

/** Amount string with at most 7 decimals (Stellar precision), or null when invalid. */
export function cleanAmount(v: string): string | null {
  const s = v.trim();
  if (!/^\d*\.?\d*$/.test(s) || !s || s === ".") return null;
  const [w, f = ""] = s.split(".");
  const out = `${w || "0"}${f ? `.${f.slice(0, 7)}` : ""}`;
  return Number(out) > 0 ? out : null;
}
