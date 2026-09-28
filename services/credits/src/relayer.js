// OZ Relayer (Channels) client for sponsored transactions.
// Transport-injected: production passes fetch to the relayer URL, tests pass
// a mock. Combines with the credits ledger: sponsored bucket first,
// FeeForwarder user-pays fallback when exhausted.

import { trySponsor } from "./index.js";

export class RelayerClient {
  constructor({ baseUrl, apiKey, transport = fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.transport = transport;
  }

  async #post(path, body) {
    const res = await this.transport(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": this.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`relayer http ${res.status} for ${path}`);
    return res.json();
  }

  /** Submit a user-signed tx; fund account pays XLM via fee-bump. */
  submitTransaction(xdr) {
    return this.#post("/submit", { xdr });
  }

  /** Fee consumption for an API key (fair-use tracking). */
  getFeeUsage() {
    return this.#post("/fee-usage", {});
  }

  /**
   * Sponsor `signedXdr` (fee `feeCharged`) against `bucket`.
   * Returns { mode: "sponsored", submit } or { mode: "user-pays", bucket }.
   */
  async sponsorOrFallback(bucket, feeCharged, signedXdr) {
    const gate = trySponsor(bucket, feeCharged);
    if (!gate.ok) return { mode: "user-pays", bucket: gate.bucket, submit: null };
    const submit = await this.submitTransaction(signedXdr);
    return { mode: "sponsored", bucket: gate.bucket, submit };
  }
}
