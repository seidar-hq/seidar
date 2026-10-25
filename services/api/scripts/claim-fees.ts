// Move Seidar's accrued service fees out of the router (the fee vault) to the
// fee address (fees.ts: SEIDAR_FEE_ADDRESS, else the sponsor account).
//
//   SEIDAR_ROUTER_ADMIN_SECRET=S... npx tsx --env-file=.env.local scripts/claim-fees.ts [token ...]
//   (testnet: STELLAR_NETWORK=testnet and TESTNET_SEIDAR_ROUTER_ADMIN_SECRET)
//
// With no tokens given, every token in the swap registry is checked. A
// classic asset can only be claimed to an address that holds a trustline for
// it; those are reported and skipped.
import * as sdk from "@stellar/stellar-sdk";
import { feeAddress, routerAddress } from "../src/fees.js";
import { netEnv } from "../src/net.js";
import { buildInvoke, mapLimit, networkPassphrase, sorobanView, submitAndWait } from "../src/rpc.js";
import { getSwapTokens, type SwapToken } from "../src/swap.js";

const router = routerAddress();
const secret = netEnv("SEIDAR_ROUTER_ADMIN_SECRET");
if (!router) throw new Error("no Seidar router on this network (SEIDAR_ROUTER)");
if (!secret) throw new Error("SEIDAR_ROUTER_ADMIN_SECRET is not set");
const admin = sdk.Keypair.fromSecret(secret);
const to = await feeAddress();
if (!to) throw new Error("no fee address: set SEIDAR_FEE_ADDRESS (or SEIDAR_SPONSOR_SECRET)");

const args = process.argv.slice(2);
const tokens = args.length
  ? args
  : (((await getSwapTokens()).body as { tokens?: SwapToken[] }).tokens ?? []).map((t) => t.contract);
const a = (x: string) => sdk.Address.fromString(x).toScVal();
const balances = await mapLimit(tokens, 4, async (t) => {
  const b = await sorobanView(t, "balance", [a(router)]).catch(() => 0n);
  return { token: t, amount: BigInt(String(b ?? 0)) };
});
console.log(`router ${router} -> ${to}`);
for (const { token, amount } of balances.filter((b) => b.amount > 0n)) {
  const op = new sdk.Contract(router).call("claim", a(token), sdk.nativeToScVal(amount, { type: "i128" }), a(to));
  try {
    const built = await buildInvoke({ from: admin.publicKey(), op });
    const tx = sdk.TransactionBuilder.fromXDR(built.xdr, networkPassphrase()) as sdk.Transaction;
    tx.sign(admin);
    const r = await submitAndWait(tx.toXDR());
    console.log(`${r.ok ? "✓" : "✗"} ${token} ${amount} ${r.hash ?? ""} ${r.ok ? "" : r.error}`);
  } catch (e) {
    console.log(`✗ ${token} ${amount}: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`);
  }
}
