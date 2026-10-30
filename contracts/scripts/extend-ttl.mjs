// Keep seidar-leverage and its receiver alive: extend both contract instances and both WASM code
// entries to `days` of TTL (the contracts never extend themselves, so users never pay rent).
// Simulation only unless --send; the fee is the rent for the ledgers added.
//
//   node contracts/scripts/extend-ttl.mjs <leverageContract> [days=120]            # price it
//   DEPLOYER_SECRET=S... node contracts/scripts/extend-ttl.mjs <leverage> 120 --send
//
// Mainnet rent at the time of writing: ~0.0103 XLM per KB of code per day (~0.21 XLM/day for
// both contracts). A freshly uploaded WASM lives 120 days before it first needs this.

import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../services/api/package.json"));
const sdk = require("@stellar/stellar-sdk");

const [leverage, daysArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const send = process.argv.includes("--send");
if (!leverage) throw new Error("usage: extend-ttl.mjs <leverageContract> [days] [--send]");
const days = Number(daysArg ?? 120);
const TESTNET = process.env.NETWORK === "testnet";
const server = new sdk.rpc.Server(process.env.RPC_URL || (TESTNET ? "https://soroban-testnet.stellar.org" : "https://soroban-rpc.mainnet.stellar.gateway.fm"));
const passphrase = TESTNET ? sdk.Networks.TESTNET : sdk.Networks.PUBLIC;
const instanceKey = (c) =>
  sdk.xdr.LedgerKey.contractData(
    new sdk.xdr.LedgerKeyContractData({
      contract: sdk.Address.fromString(c).toScAddress(),
      key: sdk.xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: sdk.xdr.ContractDataDurability.persistent(),
    }),
  );

// The receiver's address is stored in the leverage instance (Key::Receiver).
async function receiverOf(c) {
  const r = await server.getLedgerEntries(instanceKey(c));
  const storage = r.entries[0].val.contractData().val().instance().storage() ?? [];
  for (const e of storage) {
    // Key::Receiver is a unit enum variant: a vec holding the symbol "Receiver".
    const k = e.key();
    if (k.switch().name === "scvVec" && k.vec()?.[0]?.switch().name === "scvSymbol" && k.vec()[0].sym().toString() === "Receiver")
      return sdk.Address.fromScVal(e.val()).toString();
  }
  throw new Error("receiver not found in the leverage instance");
}

const receiver = await receiverOf(leverage);
const keys = [];
for (const c of [leverage, receiver]) {
  const ik = instanceKey(c);
  keys.push(ik);
  const ie = (await server.getLedgerEntries(ik)).entries[0];
  const hash = ie.val.contractData().val().instance().executable().wasmHash();
  keys.push(sdk.xdr.LedgerKey.contractCode(new sdk.xdr.LedgerKeyContractCode({ hash })));
}
const latest = (await server.getLatestLedger()).sequence;
for (const r of (await server.getLedgerEntries(...keys)).entries)
  console.log(`  ${r.key.switch().name} live for ${((r.liveUntilLedgerSeq - latest) / 17280).toFixed(1)} days`);

const source = send ? sdk.Keypair.fromSecret(process.env.DEPLOYER_SECRET ?? "") : null;
const acct = await server.getAccount(source ? source.publicKey() : (process.env.SOURCE ?? "GABFQIK63R2NETJM7T673EAMZN4RJLLGP3OFUEJU5SZVTGWUKULZJNL6"));
let tx = new sdk.TransactionBuilder(acct, { fee: "1000", networkPassphrase: passphrase })
  .addOperation(sdk.Operation.extendFootprintTtl({ extendTo: days * 17280 }))
  .setSorobanData(new sdk.SorobanDataBuilder().setReadOnly(keys).build())
  .setTimeout(120)
  .build();
const sim = await server.simulateTransaction(tx);
if (sdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
console.log(`extend to ${days} days: rent ${(Number(sim.minResourceFee) / 1e7).toFixed(4)} XLM`);
if (!send) process.exit(0);
tx = sdk.rpc.assembleTransaction(tx, sim).build();
tx.sign(source);
const sent = await server.sendTransaction(tx);
console.log(`sent ${sent.status} ${sent.hash}`);
