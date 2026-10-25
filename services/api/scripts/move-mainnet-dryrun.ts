// Mainnet dry run of every step the Refinance vault and pool moves take,
// through the API's real builders (the calls refinance-moves.tsx makes),
// simulated against live mainnet state from real holders. Nothing is signed
// or sent: each step must build and simulate cleanly for its holder.
//
//   npx tsx --env-file=.env.local scripts/move-mainnet-dryrun.ts

import { buildVaultTx, getVaultPositions } from "../src/vaults.js";
import { buildLiquidity, lpPosition } from "../src/dex-liquidity.js";
import { getLpPositions } from "../src/lp-positions.js";
import { quoteSwap, buildSwap } from "../src/swap.js";
import { getContractBalances } from "../src/balances.js";

const USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const AQUA = "CAUIKL3IYGMERDRUN6YSCLWVAKIFG5Q4YJHUKM4S4NJZQIA3BAS6OJPK";
/** Holds BeansUsdcVault shares + a little USDC. */
const VAULT_HOLDER = "GDJQILWEJKQ7OVUKFSASXHTPQFP5OS7XI7DVDVCQOCYZT2O3HURBNCLZ";
const BEANS_USDC = "CBNKCU3HGFKHFOF7JTGXQCNKE3G3DXS5RDBQUKQMIIECYKXPIOUGB2S3";
const GAMI_USDC = "CCL3WITWFFXIHV2I52ECV5DPIEOFSTU3PBPR53ILPLF2IP5KHECXRUTY";
/** Holds Aqua XLM/AQUA LP shares (and AQUA). */
const LP_HOLDER = "GC7IUIQ7R6NOIFNB4PYFNVYVNHSLJIULSWQTXG7UK33UTIC6NSZIW2BC";
const AQUA_XLM_AQUA = "CCY2PXGMKNQHO7WNYXEWX76L2C5BH3JUW3RCATGUYKY7QQTRILBZIFWV";
const AQUA_AQUA_USDC = "CA6GAFOJCW4MGQQBUCQUSA3CLIH25G4SNKB2JHYKZCVWZTNW5VXMSC4O";
/** A contract that holds USDC + XLM (Soroswap XLM/USDC pair) for the raw-balance check. */
const PAIR = "CAM7DY53G63XA4AJRS24Z6VFYAFSSF76C3RZ45BE5YU3FQS5255OOABP";

let failed = 0;
async function step<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const r = await fn();
    console.log(`  ✓ ${label}`);
    return r;
  } catch (e) {
    failed++;
    console.log(`  ✗ ${label}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400));
    return null;
  }
}
const ok = <B>(r: { body: B }) => {
  const b = r.body as { ok?: boolean; error?: string };
  if (!b.ok) throw new Error(String(b.error ?? JSON.stringify(b).slice(0, 200)));
  return r.body as B & Record<string, unknown>;
};

async function main() {
  console.log("Vault move: BeansUsdcVault (DeFindex) -> Gami earnUSDC (Upshift)");
  const vp = await step("read the holder's vault deposit", async () => {
    const r = await getVaultPositions(VAULT_HOLDER);
    const p = (r.body as { positions: { vault: string; shares: string }[] }).positions.find((x) => x.vault === BEANS_USDC);
    if (!p) throw new Error("no Beans deposit");
    return p;
  });
  if (vp) {
    await step("withdraw all shares (withdraw-shares)", async () =>
      ok(await buildVaultTx({ protocol: "defindex", vault: BEANS_USDC, action: "withdraw-shares", caller: VAULT_HOLDER, shares: vp.shares, slippageBps: 50 })),
    );
    await step("withdraw part (withdraw by amount)", async () =>
      ok(await buildVaultTx({ protocol: "defindex", vault: BEANS_USDC, action: "withdraw", caller: VAULT_HOLDER, amounts: ["1000000"], slippageBps: 50 })),
    );
  }
  await step("deposit into Gami earnUSDC (amount the account holds)", async () =>
    ok(await buildVaultTx({ protocol: "upshift", vault: GAMI_USDC, action: "deposit", caller: VAULT_HOLDER, amounts: ["10000"], slippageBps: 50 })),
  );

  console.log("\nPool move: Aqua XLM/AQUA -> Aqua AQUA/USDC");
  const lp = await step("read the holder's LP positions", async () => {
    const r = await getLpPositions(LP_HOLDER);
    const p = (r.body as { positions?: { pool: string; shares: string }[] }).positions?.find((x) => x.pool === AQUA_XLM_AQUA);
    if (!p) throw new Error("no XLM/AQUA position");
    return p;
  });
  if (lp) {
    await step("remove 1% of the liquidity", async () =>
      ok(await buildLiquidity({ protocol: "aqua", pool: AQUA_XLM_AQUA, from: LP_HOLDER, action: "withdraw", shares: (BigInt(lp.shares) / 100n).toString() })),
    );
  }
  await step("swap XLM -> USDC (quote + build, the move's swap step)", async () => {
    const q = ok(await quoteSwap({ assetIn: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA", assetOut: USDC, amount: "100000000", tradeType: "EXACT_IN", slippageBps: "50" }));
    return ok(await buildSwap({ quote: q.quote, from: LP_HOLDER }));
  });
  await step("add liquidity to AQUA/USDC (balanced by the builder)", async () => {
    const pos = await lpPosition({ protocol: "aqua", pool: AQUA_AQUA_USDC, address: LP_HOLDER });
    void pos;
    return ok(await buildLiquidity({ protocol: "aqua", pool: AQUA_AQUA_USDC, from: LP_HOLDER, action: "deposit", amounts: ["10000000", "1000"] }));
  });

  console.log("\nAmounts carried between steps");
  await step("raw base-unit balances come back exact", async () => {
    const r = await getContractBalances(PAIR, [USDC]);
    const usdc = r.balances.find((b) => b.contract === USDC);
    if (!usdc || !/^\d+$/.test(usdc.raw)) throw new Error("no raw balance");
    if (Math.abs(Number(usdc.raw) / 1e7 - usdc.balance) > 1e-6) throw new Error("raw and human disagree");
    return usdc;
  });
  void AQUA;

  console.log(failed ? `\n${failed} step(s) failed.` : "\nAll move steps build and simulate on mainnet.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
