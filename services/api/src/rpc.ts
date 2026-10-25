// Shared Soroban RPC access: one endpoint list with fallback, 429/timeout
// rotation, and a process-wide concurrency cap so bursty catalogue scans
// (vault/pool enumeration) never trip public-RPC rate limits.
//
// Endpoints: RPC_URL first, then RPC_FALLBACK_URLS (comma-separated), then
// public defaults. A failing endpoint is benched for 60s.

// The network comes from the request context (net.ts): mainnet by default,
// testnet in the app's Testnet mode or with STELLAR_NETWORK=testnet
// (scripts, testnet keeper). Testnet endpoints: TESTNET_RPC_URL, then the
// SDF default.
import { isTestnet, networkPassphrase } from "./net.js";
export { networkPassphrase } from "./net.js";

function endpoints(): string[] {
  const testnet = isTestnet();
  const list = [
    (testnet ? process.env.TESTNET_RPC_URL : process.env.RPC_URL)?.trim() ?? "",
    ...((testnet ? process.env.TESTNET_RPC_FALLBACK_URLS : process.env.RPC_FALLBACK_URLS) ?? "").split(","),
    ...(testnet
      ? ["https://soroban-testnet.stellar.org"]
      : ["https://soroban-rpc.mainnet.stellar.gateway.fm", "https://mainnet.sorobanrpc.com"]),
  ]
    .map((u) => u.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return [...new Set(list)];
}

const benchedUntil = new Map<string, number>();

/** Endpoints in preference order, benched ones last. */
export function rpcUrls(): string[] {
  const now = Date.now();
  const all = endpoints();
  const live = all.filter((u) => (benchedUntil.get(u) ?? 0) <= now);
  const benched = all.filter((u) => (benchedUntil.get(u) ?? 0) > now);
  return [...live, ...benched];
}

/** Primary endpoint (for callers that need a single URL string). */
export function rpcUrl(): string {
  return rpcUrls()[0];
}

const MAX_INFLIGHT = Math.max(1, Number(process.env.RPC_MAX_INFLIGHT) || 6);
let inflight = 0;
const waiters: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (inflight < MAX_INFLIGHT) {
    inflight++;
    return;
  }
  await new Promise<void>((r) => waiters.push(r));
  inflight++;
}

function release(): void {
  inflight--;
  const next = waiters.shift();
  if (next) next();
}

export function retryable(e: unknown): boolean {
  const msg = String(e instanceof Error ? e.message : e);
  return /429|rate|timeout|timed out|abort|ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|50[234]|socket/i.test(
    msg,
  );
}

type Server = import("@stellar/stellar-sdk").rpc.Server;
const servers = new Map<string, Server>();

async function serverFor(url: string): Promise<Server> {
  let s = servers.get(url);
  if (!s) {
    const sdk = await import("@stellar/stellar-sdk");
    s = new sdk.rpc.Server(url);
    servers.set(url, s);
  }
  return s;
}

/**
 * Run `fn` against an RPC server, rotating endpoints on transient errors.
 * Non-transient errors (contract traps, bad args) throw immediately.
 */
export async function withRpc<T>(fn: (server: Server, url: string) => Promise<T>): Promise<T> {
  await acquire();
  try {
    let lastErr: unknown = null;
    const urls = rpcUrls();
    for (let attempt = 0; attempt < Math.max(3, urls.length); attempt++) {
      const url = urls[attempt % urls.length];
      try {
        return await fn(await serverFor(url), url);
      } catch (e) {
        lastErr = e;
        if (!retryable(e)) throw e;
        benchedUntil.set(url, Date.now() + 60_000);
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  } finally {
    release();
  }
}

const ZERO = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/** Read-only contract call via simulation; returns scValToNative(retval). */
export async function sorobanView(
  contractId: string,
  method: string,
  args: unknown[] = [],
): Promise<unknown> {
  const sdk = await import("@stellar/stellar-sdk");
  return withRpc(async (server) => {
    const source = new sdk.Account(ZERO, "0");
    const contract = new sdk.Contract(contractId);
    const op = (contract.call as (...a: unknown[]) => unknown)(method, ...args);
    const tx = new sdk.TransactionBuilder(source, { fee: "100", networkPassphrase: networkPassphrase() })
      .addOperation(op as never)
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if ("error" in sim && (sim as { error?: string }).error) {
      throw new Error(`simulate ${method}: ${String((sim as { error?: string }).error).slice(0, 160)}`);
    }
    const retval = (sim as { result?: { retval?: unknown } }).result?.retval;
    if (retval == null) throw new Error(`empty retval for ${method}`);
    return sdk.scValToNative(retval as never);
  });
}

/** sorobanView, but the raw return ScVal (maps keyed by structs survive). */
export async function sorobanViewRaw(
  contractId: string,
  method: string,
  args: unknown[] = [],
): Promise<import("@stellar/stellar-sdk").xdr.ScVal> {
  const sdk = await import("@stellar/stellar-sdk");
  return withRpc(async (server) => {
    const source = new sdk.Account(ZERO, "0");
    const op = (new sdk.Contract(contractId).call as (...a: unknown[]) => unknown)(method, ...args);
    const tx = new sdk.TransactionBuilder(source, { fee: "100", networkPassphrase: networkPassphrase() })
      .addOperation(op as never)
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if ("error" in sim && (sim as { error?: string }).error) {
      throw new Error(`simulate ${method}: ${String((sim as { error?: string }).error).slice(0, 160)}`);
    }
    const retval = (sim as { result?: { retval?: unknown } }).result?.retval;
    if (retval == null) throw new Error(`empty retval for ${method}`);
    return retval as import("@stellar/stellar-sdk").xdr.ScVal;
  });
}

/**
 * Build an unsigned, simulated + assembled transaction for `from` carrying a
 * single host-function op. Returns base64 XDR plus the simulated return value
 * so callers can show expected outputs before the user signs.
 */
export async function buildInvoke(opts: {
  from: string;
  op: unknown;
  timeoutSec?: number;
}): Promise<{ xdr: string; retval: unknown; minResourceFee: string | null }> {
  const sdk = await import("@stellar/stellar-sdk");
  return withRpc(async (server) => {
    const account = await server.getAccount(opts.from);
    const source = new sdk.Account(account.accountId(), account.sequenceNumber());
    const op =
      typeof opts.op === "string" ? sdk.xdr.Operation.fromXDR(opts.op, "base64") : opts.op;
    const tx = new sdk.TransactionBuilder(source, { fee: "10000", networkPassphrase: networkPassphrase() })
      .addOperation(op as never)
      .setTimeout(opts.timeoutSec ?? 300)
      .build();
    const sim = await server.simulateTransaction(tx);
    if ("error" in sim && (sim as { error?: string }).error) {
      throw new Error(humanizeSimError(String((sim as { error?: string }).error)));
    }
    const built = sdk.rpc.assembleTransaction(tx, sim as never).build();
    if (built.signatures.length > 0) throw new Error("refusing to return a signed envelope");
    const rv = (sim as { result?: { retval?: unknown } }).result?.retval;
    let retval: unknown = null;
    try {
      retval = rv != null ? sdk.scValToNative(rv as never) : null;
    } catch {
      retval = null;
    }
    const fee = (sim as { minResourceFee?: unknown }).minResourceFee;
    return { xdr: built.toXDR(), retval, minResourceFee: typeof fee === "string" ? fee : null };
  });
}

/** Turn raw host diagnostic noise into a one-line reason for the UI. */
export function humanizeSimError(raw: string): string {
  const s = raw.replace(/\s+/g, " ");
  if (process.env.DEBUG_SIM) console.error("[sim raw]", s.slice(0, 4000));
  const contractErr = s.match(/Error\(Contract, #(\d+)\)/);
  if (/resulting balance is not within the allowed range|balance is not sufficient|insufficient/i.test(s))
    return "Insufficient balance for this action.";
  if (/trustline entry is missing|trustline/i.test(s)) return "Missing trustline for this asset — add it in your wallet first.";
  if (/Error\(Auth/.test(s)) return "Authorization failed — the signing account cannot perform this action.";
  if (contractErr) return `Contract rejected the action (error #${contractErr[1]}).`;
  return `Simulation failed: ${s.slice(0, 180)}`;
}

/**
 * Submit a signed envelope and wait for the ledger verdict. Only SUCCESS is
 * ok; FAILED/timeout surface as errors with the hash so the UI never reports
 * a reverted transaction as done.
 */
export async function submitAndWait(
  signedXdr: string,
  waitMs = 45_000,
): Promise<{ ok: true; hash: string; returnValue: unknown } | { ok: false; hash: string | null; error: string }> {
  const sdk = await import("@stellar/stellar-sdk");
  const parsed = sdk.TransactionBuilder.fromXDR(signedXdr, networkPassphrase());
  if (parsed.signatures.length === 0) {
    return { ok: false, hash: null, error: "Envelope carries no signature — sign it first." };
  }
  const sent = await withRpc((server) => server.sendTransaction(parsed as never));
  const hash = sent.hash;
  if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
    let detail = "";
    try {
      const code = sent.errorResult?.result().switch().name;
      if (code) detail = ` (${code})`;
    } catch {
      /* no detail */
    }
    return {
      ok: false,
      hash,
      error:
        sent.status === "TRY_AGAIN_LATER"
          ? "Network busy — try again in a few seconds."
          : `Rejected by the network${detail}.`,
    };
  }
  if (sent.status === "DUPLICATE") {
    // Already submitted; fall through to polling the verdict.
  }
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const got = await withRpc((server) => server.getTransaction(hash));
      if (got.status === "SUCCESS") {
        let rv: unknown = null;
        try {
          rv = got.returnValue ? sdk.scValToNative(got.returnValue) : null;
        } catch {
          rv = null;
        }
        return { ok: true, hash, returnValue: rv };
      }
      if (got.status === "FAILED") {
        return { ok: false, hash, error: "Transaction failed on-chain." };
      }
    } catch {
      /* transient; keep polling */
    }
  }
  return { ok: false, hash, error: "Timed out waiting for confirmation — check the explorer." };
}

/** Map with bounded parallelism (RPC cap still applies underneath). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
