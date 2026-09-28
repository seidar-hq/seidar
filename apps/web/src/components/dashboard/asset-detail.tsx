"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { projectHref } from "@/lib/routes";
import { useWorkspace } from "./dashboard-shell";
import type { Asset, Auditor } from "./operations-pages";
import styles from "./asset-detail.module.css";

type Account = {
  id: string;
  stellar_address: string;
  label: string;
  registration_status: string;
  authorization_status: string;
  frozen: boolean;
  created_at: string;
  last_chain_transaction?: string;
  last_chain_sync_at?: string;
};
type AccountControlResult = {
  account: Account;
  mode: "recorded_only" | "managed_policy_testnet";
  execution?: {
    submitted: boolean;
    transaction_hash: string;
    function: "allow" | "disallow";
    network: "testnet";
  };
};
type Disclosure = {
  id: string;
  asset_id: string;
  auditor_id: string;
  reason: string;
  status: string;
  range_start?: string;
  range_end?: string;
  expires_at?: string;
  event_count: number;
  snapshot_hash?: string;
  created_at: string;
};
type RecoveryHealth = {
  asset_id: string;
  status: "pending" | "active" | "at_risk" | "unavailable";
  latest_ledger: number;
  network_latest_ledger: number;
  lag_ledgers: number;
  earliest_retained_ledger?: number;
  indexed_event_count: number;
  last_success_at?: string;
  last_error?: string;
};
type IndexedEvent = {
  id: string;
  ledger: number;
  tx_hash: string;
  name: string;
  type: string;
  successful: boolean;
  occurred_at: string;
};
const compact = (value?: string) =>
  value && value.length > 20
    ? `${value.slice(0, 10)}…${value.slice(-8)}`
    : value || "Not configured";
const dateInput = (value: Date) => value.toISOString().slice(0, 10);
const initialRangeStart = () => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - 15);
  return dateInput(value);
};
const initialRangeEnd = () => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - 1);
  return dateInput(value);
};
const requestNonce = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
};

export default function AssetDetail() {
  const { project } = useWorkspace();
  const params = useParams<{ assetID: string }>();
  const assetID = params.assetID;
  const [asset, setAsset] = useState<Asset | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [auditors, setAuditors] = useState<Auditor[]>([]);
  const [disclosures, setDisclosures] = useState<Disclosure[]>([]);
  const [recovery, setRecovery] = useState<RecoveryHealth | null>(null);
  const [events, setEvents] = useState<IndexedEvent[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [auditorID, setAuditorID] = useState("");
  const [reason, setReason] = useState("");
  const [rangeStart, setRangeStart] = useState(initialRangeStart);
  const [rangeEnd, setRangeEnd] = useState(initialRangeEnd);
  const [recipientKeyX, setRecipientKeyX] = useState("");
  const [recipientKeyY, setRecipientKeyY] = useState("");
  const load = useCallback(async () => {
    try {
      const [a, b, c, d, e, f] = await Promise.all([
        apiRequest<{ asset: Asset }>(
          `/v1/projects/${project.id}/assets/${assetID}`,
        ),
        apiRequest<{ accounts: Account[] }>(
          `/v1/projects/${project.id}/assets/${assetID}/accounts`,
        ),
        apiRequest<{ auditors: Auditor[] }>(
          `/v1/projects/${project.id}/auditors`,
        ),
        apiRequest<{ disclosures: Disclosure[] }>(
          `/v1/projects/${project.id}/disclosures`,
        ),
        apiRequest<{ recovery: RecoveryHealth }>(
          `/v1/projects/${project.id}/assets/${assetID}/recovery`,
        ),
        apiRequest<{ events: IndexedEvent[] }>(
          `/v1/projects/${project.id}/assets/${assetID}/events?limit=8`,
        ),
      ]);
      setAsset(a.asset);
      setAccounts(b.accounts);
      setAuditors(c.auditors);
      setDisclosures(d.disclosures.filter((item) => item.asset_id === assetID));
      setRecovery(e.recovery);
      setEvents(f.events);
      setAuditorID((current) => current || c.auditors[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this asset.");
    }
  }, [assetID, project.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(
        `/v1/projects/${project.id}/assets/${assetID}/accounts`,
        {
          method: "POST",
          body: JSON.stringify({ stellar_address: address, label }),
        },
      );
      setAddress("");
      setLabel("");
      setAccountOpen(false);
      await load();
    } catch (x) {
      setError(x instanceof Error ? x.message : "Could not add account.");
    }
  };
  const updateAccount = async (
    item: Account,
    authorization_status: string,
    frozen: boolean,
  ) => {
    try {
      const result = await apiRequest<AccountControlResult>(
        `/v1/projects/${project.id}/assets/${assetID}/accounts/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ authorization_status, frozen }),
        },
      );
      setSuccess(
        result.execution
          ? `Policy ${result.execution.function} confirmed on Stellar testnet · ${compact(result.execution.transaction_hash)}`
          : "Account state recorded. Attach a Seidar managed policy to enforce authorization on-chain.",
      );
      setError("");
      await load();
    } catch (x) {
      setError(x instanceof Error ? x.message : "Could not update account.");
    }
  };
  const assignAuditor = async () => {
    if (!auditorID) return;
    try {
      await apiRequest(
        `/v1/projects/${project.id}/assets/${assetID}/auditors/${auditorID}`,
        { method: "PUT" },
      );
      setError("");
    } catch (x) {
      setError(x instanceof Error ? x.message : "Could not attach auditor.");
    }
  };
  const createDisclosure = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const through = new Date(`${rangeEnd}T00:00:00.000Z`);
      through.setUTCDate(through.getUTCDate() + 1);
      if (!auditors.some((item) => item.id === auditorID)) {
        throw new Error("Select an auditor before continuing.");
      }
      await apiRequest(
        `/v1/projects/${project.id}/assets/${assetID}/auditors/${auditorID}`,
        { method: "PUT" },
      );
      await apiRequest(`/v1/projects/${project.id}/disclosures`, {
        method: "POST",
        body: JSON.stringify({
          asset_id: assetID,
          auditor_id: auditorID,
          scope: {
            kind: "historical_range",
            from: `${rangeStart}T00:00:00.000Z`,
            to: through.toISOString(),
            event_types: ["transfer"],
            recipient_public_key: {
              x: recipientKeyX,
              y: recipientKeyY,
            },
            request_nonce: requestNonce(),
          },
          reason,
        }),
      });
      setReason("");
      setRecipientKeyX("");
      setRecipientKeyY("");
      setDisclosureOpen(false);
      await load();
    } catch (x) {
      setError(
        x instanceof Error ? x.message : "Could not create disclosure request.",
      );
    }
  };
  const reviewDisclosure = async (
    id: string,
    decision: "approved" | "rejected",
  ) => {
    try {
      await apiRequest(`/v1/projects/${project.id}/disclosures/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      setError("");
      await load();
    } catch (x) {
      setError(
        x instanceof Error
          ? x.message
          : "Could not review disclosure request.",
      );
    }
  };
  const inspect = async () => {
    try {
      const response = await apiRequest<{ asset: Asset }>(
        `/v1/projects/${project.id}/assets/${assetID}/inspect`,
        { method: "POST" },
      );
      setAsset(response.asset);
      setError("");
    } catch (x) {
      setError(
        x instanceof Error ? x.message : "Could not inspect this contract.",
      );
    }
  };
  if (!asset)
    return <div className={styles.loading}>{error || "Loading asset…"}</div>;
  return (
    <section className={styles.page}>
      <Link href={projectHref(project.id, "assets")} className={styles.back}>
        ← Assets
      </Link>
      <header>
        <div className={styles.assetIcon}>{asset.symbol}</div>
        <div>
          <h1>{asset.name}</h1>
          <p>{asset.underlying_asset}</p>
        </div>
        <span className={styles.status}>{asset.status}</span>
      </header>
      {error && <p className={styles.error}>{error}</p>}
      {success && <p className={styles.success}>{success}</p>}
      <div className={styles.notice}>
        <b>Preview integration pinned</b>
        <span>
          {asset.implementation_version}. This record does not imply that the
          unaudited preview is production safe.
        </span>
        {asset.contract_id && (
          <button onClick={inspect}>Inspect on testnet</button>
        )}
      </div>
      <div className={styles.metrics}>
        <div>
          <small>CT contract</small>
          <code title={asset.contract_id}>{compact(asset.contract_id)}</code>
        </div>
        <div>
          <small>Compatibility</small>
          <strong>{asset.compatibility_status || "unchecked"}</strong>
        </div>
        <div>
          <small>SAC passthrough</small>
          <strong>{asset.sac_passthrough ? "Enabled" : "Disabled"}</strong>
        </div>
        <div>
          <small>Accounts</small>
          <strong>{accounts.length}</strong>
        </div>
      </div>
      <section className={styles.recoveryPanel}>
        <div className={styles.recoveryHead}>
          <div>
            <span>RECOVERY &amp; EVENT HISTORY</span>
            <h2>
              Recovery protection:{" "}
              {recovery?.status.replace("_", " ") || "pending"}
            </h2>
          </div>
          <button onClick={() => void load()}>Refresh status</button>
        </div>
        <div className={styles.recoveryStats}>
          <div>
            <small>Checkpoint</small>
            <strong>
              {recovery?.latest_ledger.toLocaleString() || "Waiting"}
            </strong>
          </div>
          <div>
            <small>Ledger lag</small>
            <strong>
              {recovery ? recovery.lag_ledgers.toLocaleString() : "—"}
            </strong>
          </div>
          <div>
            <small>Observed events</small>
            <strong>
              {recovery?.indexed_event_count.toLocaleString() || "0"}
            </strong>
          </div>
          <div>
            <small>Recent RPC coverage</small>
            <strong>
              {recovery?.earliest_retained_ledger?.toLocaleString() ||
                "Waiting"}
            </strong>
          </div>
        </div>
        {recovery?.last_error && (
          <p className={styles.recoveryError}>{recovery.last_error}</p>
        )}
        <p className={styles.recoveryCopy}>
          Recent events come directly from Stellar RPC. Historical recovery
          and disclosures use Stellar&apos;s public data lake after the
          seven-day boundary. Seidar retains operational metadata, references,
          and hashes rather than raw encrypted event bodies.
        </p>
        {events.length > 0 && (
          <div className={styles.eventList}>
            {events.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.name.replaceAll("_", " ")}</strong>
                  <span>{new Date(item.occurred_at).toLocaleString()}</span>
                </div>
                <code title={item.id}>
                  Ledger {item.ledger.toLocaleString()}
                </code>
                <code title={item.tx_hash}>{compact(item.tx_hash)}</code>
              </article>
            ))}
          </div>
        )}
      </section>
      <div className={styles.columns}>
        <section>
          <div className={styles.sectionHead}>
            <div>
              <span>PARTICIPANTS</span>
              <h2>Asset accounts</h2>
            </div>
            <button onClick={() => setAccountOpen((v) => !v)}>
              {accountOpen ? "Cancel" : "Add account"}
            </button>
          </div>
          {accountOpen && (
            <form className={styles.inlineForm} onSubmit={addAccount}>
              <label>
                Stellar account
                <input
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="G…"
                />
              </label>
              <label>
                Label
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Treasury"
                />
              </label>
              <button>Add</button>
            </form>
          )}
          {accounts.length === 0 ? (
            <p className={styles.empty}>
              No participant accounts have been added.
            </p>
          ) : (
            <div className={styles.accounts}>
              {accounts.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.label || "Unlabelled account"}</strong>
                    <code>{compact(item.stellar_address)}</code>
                  </div>
                  <select
                    value={item.authorization_status}
                    onChange={(e) =>
                      updateAccount(item, e.target.value, item.frozen)
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="allowed">Allowed</option>
                    <option value="denied">Denied</option>
                  </select>
                  <button
                    className={item.frozen ? styles.frozen : ""}
                    onClick={() =>
                      updateAccount(
                        item,
                        item.authorization_status,
                        !item.frozen,
                      )
                    }
                  >
                    {item.frozen ? "Unfreeze" : "Freeze"}
                  </button>
                  {item.last_chain_transaction && (
                    <code
                      className={styles.chainReceipt}
                      title={item.last_chain_transaction}
                    >
                      On-chain · {compact(item.last_chain_transaction)}
                    </code>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
        <aside>
          <section>
            <span>AUDITOR</span>
            <h2>Authorized visibility</h2>
            <p>
              Attach public auditor configuration. Seidar does not accept the
              private viewing key.
            </p>
            {auditors.length === 0 ? (
              <Link href={projectHref(project.id, "auditors")}>
                Register an auditor →
              </Link>
            ) : (
              <div className={styles.attach}>
                <select
                  value={auditorID}
                  onChange={(e) => setAuditorID(e.target.value)}
                >
                  {auditors.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.custody_model}
                    </option>
                  ))}
                </select>
                <button onClick={assignAuditor}>Attach</button>
              </div>
            )}
          </section>
          <section>
            <span>DISCLOSURE</span>
            <h2>Review requests</h2>
            <p>
              Approve a fixed historical range without sharing the asset&apos;s
              master viewing key. Matching encrypted events are frozen at
              approval.
            </p>
            <button
              className={styles.secondary}
              disabled={!auditorID}
              onClick={() => setDisclosureOpen((v) => !v)}
            >
              New request
            </button>
            {disclosureOpen && (
              <form
                className={styles.disclosureForm}
                onSubmit={createDisclosure}
              >
                <div className={styles.dateRange}>
                  <label>
                    From
                    <input
                      required
                      type="date"
                      max={rangeEnd}
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                    />
                  </label>
                  <label>
                    Through
                    <input
                      required
                      type="date"
                      min={rangeStart}
                      max={initialRangeEnd()}
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Recipient key X
                  <input
                    required
                    value={recipientKeyX}
                    onChange={(e) => setRecipientKeyX(e.target.value)}
                    placeholder="0x…"
                  />
                </label>
                <label>
                  Recipient key Y
                  <input
                    required
                    value={recipientKeyY}
                    onChange={(e) => setRecipientKeyY(e.target.value)}
                    placeholder="0x…"
                  />
                </label>
                <textarea
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Purpose and reviewer scope"
                />
                <button>Create request</button>
              </form>
            )}
            {disclosures.map((item) => (
              <div className={styles.disclosure} key={item.id}>
                <strong>{item.reason}</strong>
                <span>
                  {item.status} · {item.event_count || 0} events ·{" "}
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
                {item.range_start && item.range_end && (
                  <small>
                    {new Date(item.range_start).toLocaleDateString()} –{" "}
                    {new Date(
                      new Date(item.range_end).getTime() - 1,
                    ).toLocaleDateString()}
                  </small>
                )}
                {item.status === "requested" && (
                  <div className={styles.reviewActions}>
                    <button
                      onClick={() =>
                        void reviewDisclosure(item.id, "approved")
                      }
                    >
                      Approve
                    </button>
                    <button
                      onClick={() =>
                        void reviewDisclosure(item.id, "rejected")
                      }
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>
        </aside>
      </div>
    </section>
  );
}
