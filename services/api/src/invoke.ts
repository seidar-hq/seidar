// Transaction builders shared by every action: the connected wallet (G...)
// is the source and signs its own transaction.

/** Build an unsigned, simulated transaction for `from` running `op` (Operation or base64 XDR). */
export async function invokeFor(o: { from: string; signer?: string; op: unknown }): Promise<{ xdr: string }> {
  if (!/^G[A-Z2-7]{55}$/.test(o.from)) throw new Error("from must be a Stellar wallet address (G...)");
  const { buildInvoke } = await import("./rpc.js");
  return buildInvoke({ from: o.from, op: o.op });
}

/** First operation of a (third-party built) envelope, as base64 XDR. */
export async function envelopeOp(envelopeXdr: string): Promise<string> {
  const sdk = await import("@stellar/stellar-sdk");
  const env = sdk.xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64");
  return env.v1().tx().operations()[0].toXDR("base64");
}

/**
 * Re-point a contract-call operation from one address to another: every
 * `fromAddr` ScVal in its arguments (nested vecs/maps included) becomes
 * `toAddr`, and any pre-recorded auth is dropped (it's re-recorded for the
 * new actor). Lets SDK/API builders that only know G accounts (DeFindex,
 * XOXNO) produce smart-account calls.
 */
export async function retargetOp(op: unknown, fromAddr: string, toAddr: string): Promise<string> {
  const sdk = await import("@stellar/stellar-sdk");
  const o = typeof op === "string" ? sdk.xdr.Operation.fromXDR(op, "base64") : (op as import("@stellar/stellar-sdk").xdr.Operation);
  const fn = o.body().invokeHostFunctionOp().hostFunction();
  const ic = fn.invokeContract();
  const target = sdk.Address.fromString(toAddr).toScVal();
  const swap = (v: import("@stellar/stellar-sdk").xdr.ScVal): import("@stellar/stellar-sdk").xdr.ScVal => {
    switch (v.switch().name) {
      case "scvAddress":
        return sdk.Address.fromScVal(v).toString() === fromAddr ? target : v;
      case "scvVec":
        return sdk.xdr.ScVal.scvVec((v.vec() ?? []).map(swap));
      case "scvMap":
        return sdk.xdr.ScVal.scvMap(
          (v.map() ?? []).map((e) => new sdk.xdr.ScMapEntry({ key: e.key(), val: swap(e.val()) })),
        );
      default:
        return v;
    }
  };
  const args = new sdk.xdr.InvokeContractArgs({
    contractAddress: ic.contractAddress(),
    functionName: ic.functionName(),
    args: ic.args().map(swap),
  });
  return sdk.Operation.invokeHostFunction({
    func: sdk.xdr.HostFunction.hostFunctionTypeInvokeContract(args),
    auth: [],
  }).toXDR("base64");
}
