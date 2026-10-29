// Deploy seidar-leverage (+ its receiver, which the constructor deploys itself).
//
//   testnet (free, friendbot-funded throwaway key):
//     node contracts/scripts/deploy.mjs testnet
//   mainnet (the owner's funded key; ~30 XLM all in):
//     DEPLOYER_SECRET=S... node contracts/scripts/deploy.mjs mainnet
//
// Steps: upload the receiver WASM, upload the leverage WASM, create the leverage contract with
// (receiver wasm hash, Soroswap aggregator). Prints the fee of every step and the contract
// address to set as BLEND_LEVERAGE_CONTRACT on the API.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../services/api/package.json"));
const sdk = require("@stellar/stellar-sdk");

const NET = process.argv[2] === "mainnet" ? "mainnet" : "testnet";
const cfg = {
  mainnet: {
    rpc: process.env.RPC_URL || "https://soroban-rpc.mainnet.stellar.gateway.fm",
    passphrase: sdk.Networks.PUBLIC,
    aggregator: "CARVQXFP4JF5ELLXUMQ6DALR346YVGBMQOHB4ENA7SSVXAYABXLBDDC4",
  },
  testnet: {
    rpc: "https://soroban-testnet.stellar.org",
    passphrase: sdk.Networks.TESTNET,
    // Any contract works for a cost run; this is the testnet XLM SAC.
    aggregator: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  },
}[NET];

const server = new sdk.rpc.Server(cfg.rpc);
const wasmDir = path.join(here, "../target/wasm32v1-none/release");
const xlm = (s) => (Number(s) / 1e7).toFixed(4);

let kp;
if (NET === "mainnet") {
  if (!process.env.DEPLOYER_SECRET) throw new Error("DEPLOYER_SECRET (S...) required for mainnet");
  kp = sdk.Keypair.fromSecret(process.env.DEPLOYER_SECRET);
} else {
  kp = sdk.Keypair.random();
  const r = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
  if (!r.ok) throw new Error(`friendbot ${r.status}`);
}
console.log(`${NET} deployer ${kp.publicKey()}`);

let spent = 0n;
async function run(label, op) {
  const acct = await server.getAccount(kp.publicKey());
  let tx = new sdk.TransactionBuilder(acct, { fee: "1000", networkPassphrase: cfg.passphrase }).addOperation(op).setTimeout(120).build();
  tx = await server.prepareTransaction(tx);
  tx.sign(kp);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") throw new Error(`${label}: ${JSON.stringify(sent.errorResult)}`);
  let res;
  for (let i = 0; i < 60; i++) {
    res = await server.getTransaction(sent.hash);
    if (res.status !== "NOT_FOUND") break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (res.status !== "SUCCESS") throw new Error(`${label}: ${res.status} ${sent.hash}`);
  const fee = BigInt(res.resultXdr.feeCharged().toString());
  spent += fee;
  console.log(`  ✓ ${label}: fee ${xlm(fee)} XLM  tx ${sent.hash}`);
  return res;
}

const recvWasm = fs.readFileSync(path.join(wasmDir, "seidar_leverage_receiver.wasm"));
const levWasm = fs.readFileSync(path.join(wasmDir, "seidar_leverage.wasm"));
await run(`upload receiver (${recvWasm.length} B)`, sdk.Operation.uploadContractWasm({ wasm: recvWasm }));
await run(`upload leverage (${levWasm.length} B)`, sdk.Operation.uploadContractWasm({ wasm: levWasm }));
const hash = (w) => sdk.hash(w);
const created = await run(
  "create leverage (deploys its receiver)",
  sdk.Operation.createCustomContract({
    address: sdk.Address.fromString(kp.publicKey()),
    wasmHash: hash(levWasm),
    salt: Buffer.alloc(32, 0),
    constructorArgs: [sdk.xdr.ScVal.scvBytes(hash(recvWasm)), sdk.Address.fromString(cfg.aggregator).toScVal()],
  }),
);
const contract = sdk.Address.fromScVal(created.returnValue).toString();
console.log(`\nseidar-leverage: ${contract}`);
console.log(`total fees: ${xlm(spent)} XLM`);
