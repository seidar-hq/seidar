// Sentora (IntoTheBlock) vaults: incentivized deposit vaults plus one share vault (sentUSDC) on Stellar, curated through Stellar DeFi Hub.
// Source: github.com/Into-The-Block-Corp/StellarVaults (contract "vault", verified on Stellar Expert).
// Principal-only vaults: deposit(from, amount, referral) moves tokens into the vault and adds to the
// depositor's record; withdraw(from, amount) pays it back, no lock. Rewards (the quoted APY) are
// paid separately by the curator, so a position is worth its principal.
//   instance storage: DepositAsset, TotalPrincipal, Paused
//   persistent: ["Deposit", owner] -> { amount, owner }

export const SENTORA_VAULTS = [
  { address: "CA54LVHMAY7HGLMVPN4W72XJB4OGKVZBZX26FWN6JD4P3HJFWQUQEHJO", code: "XLM", asset: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA", apyPct: 5 },
  { address: "CAHEWHOPPDBQYFMAOLDOXXGUX2BCR7EXP4CWYCRY3NEAJB35YPZMMJFF", code: "USDC", asset: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75", apyPct: 8 },
  { address: "CAQRAXBU6G4AAX4BZ7R4WLB62TSVAQFS5ZXJDVXRLAU2NZ2ZTGU5QOYB", code: "PYUSD", asset: "CCCRWH6Q3FNP3I2I57BDLM5AFAT7O6OF6GKQOC6SSJNDAVRZ57SPHGU2", apyPct: 8 },
] as const;

/**
 * Share vaults (Upshift-style ERC-4626 on Soroban): deposit(assets, receiver, from, operator) mints
 * shares (13 decimals); value = shares x total_assets / total_supply. APY is the Merkl incentive.
 * "Evergreen" in Stellar DeFi Hub's DefiLlama adapter.
 */
export const SENTORA_SHARE_VAULTS = [
  { address: "CALFCZ4TY2CLHDHNJWCZX6JKYGUPV7P3GNQ3UVABXNE5JCV2E774APUM", name: "Sentora Evergreen USDC", code: "USDC", symbol: "sentUSDC", asset: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75", assetDecimals: 7 },
] as const;

const DECIMALS = 7;

/** One retry after a pause: the list rebuild bursts the public RPC and single reads 429. */
async function retry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    return fn();
  }
}

const isShareVault = (vault: string) => SENTORA_SHARE_VAULTS.find((v) => v.address === vault);

/** total_assets / total_supply plus the vault's own (instantly withdrawable) asset balance. */
async function shareState(v: (typeof SENTORA_SHARE_VAULTS)[number]) {
  const { sdk } = await server();
  const { sorobanView } = await import("./rpc.js");
  const [ta, ts, paused, local] = await Promise.all([
    sorobanView(v.address, "total_assets"),
    sorobanView(v.address, "total_supply"),
    sorobanView(v.address, "is_paused").catch(() => false),
    sorobanView(v.asset, "balance", [new sdk.Address(v.address).toScVal()]).catch(() => null),
  ]);
  return { assets: BigInt(String(ta)), supply: BigInt(String(ts)), paused: Boolean(paused), local: local == null ? null : BigInt(String(local)) };
}

async function shareBalance(vault: string, owner: string): Promise<bigint> {
  const { sdk } = await server();
  const { sorobanView } = await import("./rpc.js");
  return BigInt(String(await sorobanView(vault, "balance", [new sdk.Address(owner).toScVal()])));
}

async function server() {
  const sdk = await import("@stellar/stellar-sdk");
  const { rpcUrl } = await import("./rpc.js");
  return { sdk, rpc: new sdk.rpc.Server(rpcUrl()) };
}

/** Vault state from instance storage: total principal (base units) and paused flag. */
export async function sentoraState(vault: string): Promise<{ totalBase: bigint; paused: boolean }> {
  const { sdk, rpc } = await server();
  const e = await rpc.getContractData(vault, sdk.xdr.ScVal.scvLedgerKeyContractInstance());
  let totalBase = 0n;
  let paused = false;
  for (const kv of e.val.contractData().val().instance().storage() ?? []) {
    const k = sdk.scValToNative(kv.key()) as unknown[];
    const v = sdk.scValToNative(kv.val());
    if (Array.isArray(k) && k[0] === "TotalPrincipal") totalBase = BigInt(String(v));
    if (Array.isArray(k) && k[0] === "Paused") paused = Boolean(v);
  }
  return { totalBase, paused };
}

/** A depositor's principal in a vault (base units); 0 when they have no record. */
export async function sentoraPrincipal(vault: string, owner: string): Promise<bigint> {
  const { sdk, rpc } = await server();
  const key = sdk.xdr.ScVal.scvVec([sdk.xdr.ScVal.scvSymbol("Deposit"), new sdk.Address(owner).toScVal()]);
  try {
    const d = await rpc.getContractData(vault, key, sdk.rpc.Durability.Persistent);
    const rec = sdk.scValToNative(d.val.contractData().val()) as { amount?: bigint | string };
    return BigInt(String(rec?.amount ?? 0));
  } catch {
    return 0n;
  }
}

/** Vault rows in the shared VaultRow shape (TVL priced by the caller's price map). */
export async function sentoraRows(prices: Record<string, number | null | undefined>, merklApr: Record<string, number | null> = {}) {
  const now = Date.now();
  const rows = await Promise.all(
    SENTORA_VAULTS.map(async (v) => {
      const s = await retry(() => sentoraState(v.address)).catch(() => null);
      if (!s) return null;
      const amount = Number(s.totalBase) / 10 ** DECIMALS;
      const px = prices[v.code] ?? (v.code === "PYUSD" || v.code === "USDC" ? 1 : null);
      const tvlUsd = px != null ? amount * px : 0;
      return {
        protocol: "sentora" as const,
        address: v.address,
        name: `Sentora ${v.code}`,
        symbol: `s${v.code}`,
        asset: v.asset,
        assetCode: v.code,
        assetDecimals: DECIMALS,
        tvlUsd,
        apyPct: v.apyPct,
        apySource: "advertised" as const,
        liquidityUsd: tvlUsd,
        curator: "Sentora",
        withdrawalDays: 0,
        updatedAt: now,
        legs: [{ asset: v.asset, code: v.code, decimals: DECIMALS, totalBase: s.totalBase.toString(), tvlUsd, priceUsd: px }],
        feeSplitBps: null,
        sharePrice: 1,
        paused: s.paused,
      };
    }),
  );
  const shares = await Promise.all(
    SENTORA_SHARE_VAULTS.map(async (v) => {
      const s = await retry(() => shareState(v)).catch(() => null);
      if (!s) return null;
      const amount = Number(s.assets) / 10 ** v.assetDecimals;
      const px = prices[v.code] ?? (v.code === "USDC" ? 1 : null);
      const tvlUsd = px != null ? amount * px : 0;
      const apy = merklApr[v.address] ?? null;
      return {
        protocol: "sentora" as const,
        address: v.address,
        name: v.name,
        symbol: v.symbol,
        asset: v.asset,
        assetCode: v.code,
        assetDecimals: v.assetDecimals,
        tvlUsd,
        apyPct: apy,
        apySource: apy != null ? ("advertised" as const) : null,
        liquidityUsd: s.local != null && px != null ? (Number(s.local) / 10 ** v.assetDecimals) * px : null,
        curator: "Sentora",
        withdrawalDays: 0,
        updatedAt: now,
        legs: [{ asset: v.asset, code: v.code, decimals: v.assetDecimals, totalBase: s.assets.toString(), tvlUsd, priceUsd: px }],
        feeSplitBps: null,
        sharePrice: s.supply > 0n ? amount / (Number(s.supply) / 1e13) : 1,
        paused: s.paused,
      };
    }),
  );
  return [...rows, ...shares].filter((r): r is NonNullable<typeof r> => r != null);
}

/** Positions for an owner in the EarnPosition shape. */
export async function sentoraPositions(owner: string, prices: Record<string, number | null | undefined>) {
  const out = await Promise.all(
    SENTORA_VAULTS.map(async (v) => {
      const base = await sentoraPrincipal(v.address, owner);
      if (base <= 0n) return null;
      const amount = Number(base) / 10 ** DECIMALS;
      const px = prices[v.code] ?? (v.code === "PYUSD" || v.code === "USDC" ? 1 : null);
      return {
        protocol: "sentora",
        vault: v.address,
        name: `Sentora ${v.code}`,
        shares: base.toString(),
        underlying: [{ asset: v.asset, code: v.code, amount: base.toString() }],
        valueUsd: px != null ? amount * px : null,
      };
    }),
  );
  const shares = await Promise.all(
    SENTORA_SHARE_VAULTS.map(async (v) => {
      const n = await shareBalance(v.address, owner).catch(() => 0n);
      if (n <= 0n) return null;
      const s = await shareState(v);
      const base = s.supply > 0n ? (s.assets * n) / s.supply : 0n;
      const px = prices[v.code] ?? (v.code === "USDC" ? 1 : null);
      return {
        protocol: "sentora",
        vault: v.address,
        name: v.name,
        shares: n.toString(),
        underlying: [{ asset: v.asset, code: v.code, amount: base.toString() }],
        valueUsd: px != null ? (Number(base) / 10 ** v.assetDecimals) * px : null,
      };
    }),
  );
  return [...out, ...shares].filter((p): p is NonNullable<typeof p> => p != null);
}

/** Share vault: deposit assets, withdraw assets, or redeem every share ("max"). */
async function buildShareVault(v: (typeof SENTORA_SHARE_VAULTS)[number], o: { action: string; caller: string; amount: string }) {
  const { sdk } = await server();
  const who = new sdk.Address(o.caller).toScVal();
  const c = new sdk.Contract(v.address);
  const i128 = (n: bigint) => sdk.nativeToScVal(n, { type: "i128" });
  let op;
  if (o.action === "withdraw" && o.amount === "max") {
    const n = await shareBalance(v.address, o.caller);
    if (n <= 0n) return { ok: false as const, error: "Nothing to withdraw." };
    op = c.call("redeem", i128(n), who, who, who);
  } else {
    const amount = /^\d+$/.test(o.amount) ? BigInt(o.amount) : 0n;
    if (amount <= 0n) return { ok: false as const, error: "Enter an amount." };
    if (o.action === "deposit") op = c.call("deposit", i128(amount), who, who, who);
    else if (o.action === "withdraw") op = c.call("withdraw", i128(amount), who, who, who);
    else return { ok: false as const, error: "action must be deposit | withdraw" };
  }
  const { invokeFor } = await import("./invoke.js");
  const { xdr } = await invokeFor({ from: o.caller, op });
  return { ok: true as const, xdr, label: `${o.action === "deposit" ? "Deposit" : "Withdraw"} ${v.code} · Sentora` };
}

/** Unsigned deposit / withdraw for a wallet (amount in base units, or "max" to withdraw all). */
export async function buildSentora(o: { vault: string; action: string; caller: string; amount: string }) {
  const sv = isShareVault(o.vault);
  if (sv) return buildShareVault(sv, o);
  const v = SENTORA_VAULTS.find((x) => x.address === o.vault);
  if (!v) return { ok: false as const, error: "unknown Sentora vault" };
  const { sdk } = await server();
  let amount = /^\d+$/.test(o.amount) ? BigInt(o.amount) : 0n;
  if (o.action === "withdraw" && o.amount === "max") amount = await sentoraPrincipal(v.address, o.caller);
  if (amount <= 0n) return { ok: false as const, error: o.action === "withdraw" ? "Nothing to withdraw." : "Enter an amount." };
  if (o.action === "withdraw") {
    const have = await sentoraPrincipal(v.address, o.caller);
    if (amount > have) amount = have;
  }
  const c = new sdk.Contract(v.address);
  const who = new sdk.Address(o.caller).toScVal();
  const amt = sdk.nativeToScVal(amount, { type: "u128" });
  const op =
    o.action === "withdraw"
      ? c.call("withdraw", who, amt)
      : o.action === "deposit"
        ? c.call("deposit", who, amt, sdk.xdr.ScVal.scvVoid())
        : null;
  if (!op) return { ok: false as const, error: "action must be deposit | withdraw" };
  const { invokeFor } = await import("./invoke.js");
  const { xdr } = await invokeFor({ from: o.caller, op });
  return { ok: true as const, xdr, label: `${o.action === "deposit" ? "Deposit" : "Withdraw"} ${v.code} · Sentora` };
}

