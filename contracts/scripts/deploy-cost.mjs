// Mainnet deploy cost for the leverage contracts, by simulation only (nothing is signed or sent).
//   node contracts/scripts/deploy-cost.mjs [sourceAccount]
// Upload fees come from mainnet simulation of each WASM upload. The create step can only be
// simulated once the WASMs are on chain, so it is reported from the testnet run (deploy.mjs).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../services/api/package.json"));
const sdk = require("@stellar/stellar-sdk");

const RPC = process.env.RPC_URL || "https://soroban-rpc.mainnet.stellar.gateway.fm";
const SOURCE = process.argv[2] || "GABFQIK63R2NETJM7T673EAMZN4RJLLGP3OFUEJU5SZVTGWUKULZJNL6";
const server = new sdk.rpc.Server(RPC);
const wasmDir = path.join(here, "../target/wasm32v1-none/release");
const xlm = (stroops) => (Number(stroops) / 1e7).toFixed(4);

let total = 0n;
for (const name of ["seidar_leverage_receiver.wasm", "seidar_leverage.wasm"]) {
  const wasm = fs.readFileSync(path.join(wasmDir, name));
  const acct = await server.getAccount(SOURCE);
  const tx = new sdk.TransactionBuilder(acct, { fee: "100", networkPassphrase: sdk.Networks.PUBLIC })
    .addOperation(sdk.Operation.uploadContractWasm({ wasm }))
    .setTimeout(60)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (sdk.rpc.Api.isSimulationError(sim)) throw new Error(`${name}: ${sim.error}`);
  const fee = BigInt(sim.minResourceFee) + 100n;
  total += fee;
  console.log(`${name}: ${wasm.length} bytes, upload fee ${xlm(fee)} XLM`);
}
console.log(`uploads total: ${xlm(total)} XLM`);
