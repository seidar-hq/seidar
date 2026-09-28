"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "./dashboard-shell";
import WorkspacePage from "./workspace-page";
import { apiRequest, apiURL } from "@/lib/api";
import { projectHref } from "@/lib/routes";
import styles from "./operations-pages.module.css";

export type Asset = {
  id: string;
  name: string;
  symbol: string;
  network: string;
  contract_id?: string;
  underlying_asset: string;
  implementation_version: string;
  status: string;
  sac_passthrough: boolean;
  admin_address?: string;
  compatibility_status: string;
  capabilities: string[];
  last_inspected_at?: string;
  created_at: string;
};
type Policy = {
  id: string;
  asset_id?: string;
  name: string;
  type: string;
  contract_id?: string;
  configuration: Record<string, unknown>;
  status: string;
  template_id?: "allowlist" | "blocklist";
  compatibility_status: "unchecked" | "compatible" | "unsupported" | "unavailable";
  capabilities: string[];
  missing_capabilities: string[];
  wasm_hash?: string;
  last_inspected_at?: string;
  hook_status: "not_connected" | "connecting" | "connected" | "failed";
  hook_transaction_hash?: string;
  created_at: string;
};
type PolicyTemplate = {
  id: "allowlist" | "blocklist";
  name: string;
  description: string;
  default_effect: "allow" | "deny";
  capabilities: string[];
  contract_id?: string;
  available: boolean;
};
type PolicyInspection = {
  contract_id: string;
  compatible: boolean;
  compatibility_status: "compatible" | "unsupported";
  capabilities: string[];
  missing_capabilities: string[];
  wasm_hash?: string;
};
export type Auditor = {
  id: string;
  name: string;
  public_key: string;
  custody_model: string;
  status: string;
  notes: string;
  created_at: string;
};
type Activity = {
  id: string;
  asset_id?: string;
  event_type: string;
  source: string;
  summary: string;
  transaction_hash?: string;
  occurred_at: string;
};
type Alert = {
  id: string;
  severity: string;
  title: string;
  detail: string;
  status: string;
  created_at: string;
};

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyMark}>⌁</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
function ErrorMessage({ value }: { value: string }) {
  return value ? (
    <p className={styles.error} role="alert">
      {value}
    </p>
  ) : null;
}
function short(value?: string) {
  return value && value.length > 18
    ? `${value.slice(0, 8)}…${value.slice(-6)}`
    : value || "—";
}
function statusClass(value: string) {
  return `${styles.status} ${styles[value] ?? ""}`;
}

export function AssetsPageView() {
  const { project } = useWorkspace();
  const [items, setItems] = useState<Asset[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    underlying_asset: "native:XLM",
    contract_id: "",
    admin_address: "",
    sac_passthrough: false,
  });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiRequest<{ assets: Asset[] }>(
        `/v1/projects/${project.id}/assets`,
      );
      setItems(r.assets);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load assets.");
    } finally {
      setLoading(false);
    }
  }, [project.id]);
  // The request resolves asynchronously and synchronizes this view with the selected project.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/v1/projects/${project.id}/assets`, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          contract_id: form.contract_id || null,
          admin_address: form.admin_address || null,
        }),
      });
      setForm({
        name: "",
        symbol: "",
        underlying_asset: "native:XLM",
        contract_id: "",
        admin_address: "",
        sac_passthrough: false,
      });
      setOpen(false);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create asset.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <WorkspacePage
      title="Assets"
      description="Launch confidential versions of Stellar assets or import deployments you already operate."
      action={
        <button className={styles.primary} onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "New asset"}
        </button>
      }
    >
      <div className={styles.content}>
        <ErrorMessage value={error} />
        {open && (
          <form className={styles.formCard} onSubmit={save}>
            <div>
              <h2>
                {form.contract_id
                  ? "Import confidential asset"
                  : "Create asset draft"}
              </h2>
              <p>
                Add a CT deployment now, or create its operating record before
                deployment.
              </p>
            </div>
            <div className={styles.formGrid}>
              <label>
                Asset name
                <input
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Confidential USD"
                />
              </label>
              <label>
                Symbol
                <input
                  required
                  maxLength={12}
                  value={form.symbol}
                  onChange={(e) =>
                    setForm({ ...form, symbol: e.target.value.toUpperCase() })
                  }
                  placeholder="CUSD"
                />
              </label>
              <label>
                Underlying Stellar asset
                <input
                  required
                  value={form.underlying_asset}
                  onChange={(e) =>
                    setForm({ ...form, underlying_asset: e.target.value })
                  }
                />
              </label>
              <label>
                CT contract ID <small>optional</small>
                <input
                  value={form.contract_id}
                  onChange={(e) =>
                    setForm({ ...form, contract_id: e.target.value })
                  }
                  placeholder="C…"
                />
              </label>
              <label>
                Administrator address <small>optional</small>
                <input
                  value={form.admin_address}
                  onChange={(e) =>
                    setForm({ ...form, admin_address: e.target.value })
                  }
                  placeholder="G…"
                />
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={form.sac_passthrough}
                  onChange={(e) =>
                    setForm({ ...form, sac_passthrough: e.target.checked })
                  }
                />
                <span>Enable SAC authorization passthrough</span>
              </label>
            </div>
            <button disabled={saving}>
              {saving
                ? "Saving…"
                : form.contract_id
                  ? "Import asset"
                  : "Create draft"}
            </button>
          </form>
        )}
        {loading ? (
          <p className={styles.loading}>Loading assets…</p>
        ) : items.length === 0 ? (
          <Empty
            title="No confidential assets"
            body="Create an operating record or import a testnet CT deployment to begin."
          />
        ) : (
          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Asset</span>
              <span>Underlying</span>
              <span>Contract</span>
              <span>Status</span>
            </div>
            {items.map((item) => (
              <Link
                href={projectHref(project.id, "assets", item.id)}
                className={styles.tableRow}
                key={item.id}
              >
                <span className={styles.assetName}>
                  <b>{item.symbol}</b>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.network}</small>
                  </span>
                </span>
                <span>{item.underlying_asset}</span>
                <code>{short(item.contract_id)}</code>
                <span className={statusClass(item.status)}>{item.status}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </WorkspacePage>
  );
}

export function PoliciesPageView() {
  const { project } = useWorkspace();
  const [items, setItems] = useState<Policy[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [templates, setTemplates] = useState<PolicyTemplate[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [connecting, setConnecting] = useState("");
  const [inspection, setInspection] = useState<PolicyInspection | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    type: "managed",
    template_id: "allowlist",
    asset_id: "",
    contract_id: "",
  });
  const load = useCallback(async () => {
    try {
      const [a, p, t] = await Promise.all([
        apiRequest<{ assets: Asset[] }>(`/v1/projects/${project.id}/assets`),
        apiRequest<{ policies: Policy[] }>(
          `/v1/projects/${project.id}/policies`,
        ),
        apiRequest<{ templates: PolicyTemplate[] }>(
          `/v1/projects/${project.id}/policy-templates`,
        ),
      ]);
      setAssets(a.assets);
      setItems(p.policies);
      setTemplates(t.templates);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load policies.");
    }
  }, [project.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/v1/projects/${project.id}/policies`, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          asset_id: form.asset_id || null,
          contract_id: form.contract_id || null,
          template_id: form.type === "managed" ? form.template_id : null,
          configuration: {
            mode:
              form.type === "managed" ? form.template_id : "external_hook",
          },
        }),
      });
      setOpen(false);
      setInspection(null);
      setForm({
        name: "",
        type: "managed",
        template_id: "allowlist",
        asset_id: "",
        contract_id: "",
      });
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create policy.",
      );
    } finally {
      setSaving(false);
    }
  };
  const inspect = async () => {
    setInspecting(true);
    setError("");
    setInspection(null);
    try {
      const result = await apiRequest<{ inspection: PolicyInspection }>(
        `/v1/projects/${project.id}/policies/inspect`,
        {
          method: "POST",
          body: JSON.stringify({ contract_id: form.contract_id }),
        },
      );
      setInspection(result.inspection);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not inspect policy.",
      );
    } finally {
      setInspecting(false);
    }
  };
  const connect = async (policyID: string) => {
    setConnecting(policyID);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<{
        mode: "confirmed_on_stellar" | "manual_required" | "already_connected";
      }>(`/v1/projects/${project.id}/policies/${policyID}/attach`, {
        method: "POST",
      });
      setNotice(
        result.mode === "confirmed_on_stellar"
          ? "Policy hook connected and confirmed on Stellar."
          : result.mode === "already_connected"
            ? "This policy hook is already connected."
          : "A configured issuer signer must connect this hook on Stellar.",
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not connect policy.",
      );
    } finally {
      setConnecting("");
    }
  };
  const selectedAsset = assets.find((asset) => asset.id === form.asset_id);
  return (
    <WorkspacePage
      title="Policies"
      description="Configure and operate the authorization rules governing each confidential asset."
      action={
        <button className={styles.primary} onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "New policy"}
        </button>
      }
    >
      <div className={styles.content}>
        <ErrorMessage value={error} />
        {notice && <p className={styles.notice}>{notice}</p>}
        {open && (
          <form className={styles.formCard} onSubmit={save}>
            <div>
              <h2>Add authorization policy</h2>
              <p>
                Start with a Seidar template or bring a compatible Soroban
                contract. Nothing is enforced until you connect the hook to an
                asset.
              </p>
            </div>
            <div className={styles.policyChoices}>
              {templates.map((template) => (
                <button
                  type="button"
                  key={template.id}
                  disabled={!template.available}
                  className={
                    form.type === "managed" &&
                    form.template_id === template.id
                      ? styles.policyChoiceSelected
                      : ""
                  }
                  onClick={() => {
                    setInspection(null);
                    setForm({
                      ...form,
                      type: "managed",
                      template_id: template.id,
                      contract_id: "",
                    });
                  }}
                >
                  <strong>{template.name}</strong>
                  <span>{template.description}</span>
                  <small>
                    {template.available
                      ? `Default ${template.default_effect}`
                      : "Contract not configured"}
                  </small>
                </button>
              ))}
              <button
                type="button"
                className={
                  form.type === "external" ? styles.policyChoiceSelected : ""
                }
                onClick={() => {
                  setInspection(null);
                  setForm({ ...form, type: "external" });
                }}
              >
                <strong>Bring your own</strong>
                <span>Use an existing contract that implements the CT policy hook.</span>
                <small>Validated before activation</small>
              </button>
            </div>
            <div className={styles.formGrid}>
              <label>
                Policy name
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Approved participants"
                />
              </label>
              <label>
                Confidential asset
                <select
                  required
                  value={form.asset_id}
                  onChange={(e) =>
                    setForm({ ...form, asset_id: e.target.value })
                  }
                >
                  <option value="" disabled>
                    Select an asset
                  </option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.symbol} — {a.name}
                    </option>
                  ))}
                </select>
              </label>
              {form.type === "external" && (
                <label>
                  Policy contract ID
                  <input
                    required
                    value={form.contract_id}
                    onChange={(e) => {
                      setInspection(null);
                      setForm({ ...form, contract_id: e.target.value });
                    }}
                    placeholder="C…"
                  />
                  <button
                    type="button"
                    className={styles.inspectButton}
                    disabled={inspecting || !form.contract_id}
                    onClick={inspect}
                  >
                    {inspecting ? "Inspecting…" : "Inspect contract"}
                  </button>
                </label>
              )}
            </div>
            {form.type === "external" && inspection && (
              <div
                className={`${styles.inspection} ${
                  inspection.compatible ? styles.compatible : styles.unsupported
                }`}
              >
                <strong>
                  {inspection.compatible
                    ? "Compatible policy hook"
                    : "Unsupported policy hook"}
                </strong>
                <span>
                  {inspection.compatible
                    ? `Capabilities: ${inspection.capabilities.join(", ")}`
                    : `Missing: ${inspection.missing_capabilities.join(", ")}`}
                </span>
              </div>
            )}
            {selectedAsset && !selectedAsset.contract_id && (
              <p className={styles.formHint}>
                This asset is still a draft. Add its CT contract ID before
                connecting the policy hook.
              </p>
            )}
            <button disabled={saving || (form.type === "external" && inspection?.compatible === false)}>
              {saving ? "Creating…" : "Create policy"}
            </button>
          </form>
        )}
        {items.length === 0 ? (
          <Empty
            title="No authorization policies"
            body="Add a managed allowlist or connect a compatible Soroban policy contract."
          />
        ) : (
          <div className={styles.cards}>
            {items.map((item) => (
              <article className={styles.card} key={item.id}>
                <div>
                  <span className={styles.iconBox}>⌾</span>
                  <span className={statusClass(item.hook_status)}>
                    {item.hook_status.replaceAll("_", " ")}
                  </span>
                </div>
                <h3>{item.name}</h3>
                <p>
                  {item.type === "managed"
                    ? item.template_id === "blocklist"
                      ? "Seidar-managed blocked participant registry"
                      : "Seidar-managed approved participant registry"
                    : "Externally deployed compatible policy contract"}
                </p>
                <dl>
                  <div>
                    <dt>Policy</dt>
                    <dd>{item.template_id ?? "Bring your own"}</dd>
                  </div>
                  <div>
                    <dt>Asset</dt>
                    <dd>
                      {assets.find((a) => a.id === item.asset_id)?.symbol ??
                        "Project-wide"}
                    </dd>
                  </div>
                  <div>
                    <dt>Compatibility</dt>
                    <dd>{item.compatibility_status}</dd>
                  </div>
                  <div>
                    <dt>Contract</dt>
                    <dd>
                      <code>{short(item.contract_id)}</code>
                    </dd>
                  </div>
                </dl>
                {item.compatibility_status === "compatible" &&
                  item.hook_status !== "connected" && (
                    <button
                      className={styles.connectButton}
                      disabled={
                        connecting === item.id ||
                        !item.asset_id ||
                        !assets.find((asset) => asset.id === item.asset_id)
                          ?.contract_id
                      }
                      onClick={() => void connect(item.id)}
                    >
                      {connecting === item.id ? "Connecting…" : "Connect hook"}
                    </button>
                  )}
                {item.hook_status === "connected" && (
                  <small className={styles.connectedHook}>
                    Connected on Stellar
                    <code>{short(item.hook_transaction_hash)}</code>
                  </small>
                )}
                {item.compatibility_status === "unsupported" && (
                  <small className={styles.missingHook}>
                    Missing {item.missing_capabilities.join(", ")}
                  </small>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </WorkspacePage>
  );
}

export function AuditorsPageView() {
  const { project } = useWorkspace();
  const [items, setItems] = useState<Auditor[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    public_key: "",
    custody_model: "external",
    notes: "",
  });
  const load = useCallback(async () => {
    try {
      const r = await apiRequest<{ auditors: Auditor[] }>(
        `/v1/projects/${project.id}/auditors`,
      );
      setItems(r.auditors);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load auditors.");
    }
  }, [project.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(`/v1/projects/${project.id}/auditors`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      setOpen(false);
      setForm({
        name: "",
        public_key: "",
        custody_model: "external",
        notes: "",
      });
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not add auditor.",
      );
    }
  };
  return (
    <WorkspacePage
      title="Auditors"
      description="Register viewing authorities without storing private auditor key material in Seidar."
      action={
        <button className={styles.primary} onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "Add auditor"}
        </button>
      }
    >
      <div className={styles.content}>
        <ErrorMessage value={error} />
        {open && (
          <form className={styles.formCard} onSubmit={save}>
            <div>
              <h2>Register auditor metadata</h2>
              <p>
                Only public configuration belongs here. Keep viewing keys with
                your external custodian.
              </p>
            </div>
            <div className={styles.formGrid}>
              <label>
                Name
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Regulatory review"
                />
              </label>
              <label>
                Custody model
                <select
                  value={form.custody_model}
                  onChange={(e) =>
                    setForm({ ...form, custody_model: e.target.value })
                  }
                >
                  <option value="external">External custodian</option>
                  <option value="hsm">HSM</option>
                  <option value="mpc">MPC</option>
                  <option value="development">Development only</option>
                </select>
              </label>
              <label className={styles.full}>
                Auditor public key
                <input
                  required
                  value={form.public_key}
                  onChange={(e) =>
                    setForm({ ...form, public_key: e.target.value })
                  }
                  placeholder="Public auditor key or registry identifier"
                />
              </label>
              <label className={styles.full}>
                Operational notes
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
            </div>
            <button>Register auditor</button>
          </form>
        )}
        {items.length === 0 ? (
          <Empty
            title="No auditors configured"
            body="Register public auditor metadata and its custody relationship to begin."
          />
        ) : (
          <div className={styles.cards}>
            {items.map((item) => (
              <article className={styles.card} key={item.id}>
                <div>
                  <span className={styles.iconBox}>◇</span>
                  <span className={statusClass(item.status)}>
                    {item.status}
                  </span>
                </div>
                <h3>{item.name}</h3>
                <p>{item.notes || "No operational notes."}</p>
                <dl>
                  <div>
                    <dt>Custody</dt>
                    <dd>{item.custody_model}</dd>
                  </div>
                  <div>
                    <dt>Public key</dt>
                    <dd>
                      <code>{short(item.public_key)}</code>
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </div>
    </WorkspacePage>
  );
}

export function ActivityPageView() {
  const { project } = useWorkspace();
  const [items, setItems] = useState<Activity[]>([]);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (query) params.set("q", query);
      const r = await apiRequest<{ activity: Activity[] }>(
        `/v1/projects/${project.id}/activity?${params}`,
      );
      setItems(r.activity);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load activity.");
    }
  }, [category, project.id, query]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 150);
    return () => clearTimeout(timer);
  }, [load]);
  const tabs = [
    "",
    "transactions",
    "accounts",
    "policies",
    "auditors",
    "admin",
  ];
  const exportCSV = async () => {
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (query) params.set("q", query);
      const response = await fetch(
        apiURL(`/v1/projects/${project.id}/activity/export?${params}`),
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Could not export activity.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `seidar-${project.slug}-activity.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not export activity.",
      );
    }
  };
  return (
    <WorkspacePage
      title="Activity"
      description="A normalized, searchable record of what happened across this project."
      action={
        <button className={styles.primary} onClick={exportCSV}>
          Export CSV
        </button>
      }
    >
      <div className={styles.content}>
        <div className={styles.filters}>
          <div>
            {tabs.map((t) => (
              <button
                className={category === t ? styles.selected : ""}
                key={t}
                onClick={() => setCategory(t)}
              >
                {t || "all"}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search account, contract, transaction…"
          />
        </div>
        <ErrorMessage value={error} />
        {items.length === 0 ? (
          <Empty
            title="No matching activity"
            body="Operational events will appear here as your team configures and uses assets."
          />
        ) : (
          <div className={styles.timeline}>
            {items.map((item) => (
              <article key={item.id}>
                <span className={styles.eventDot} />
                <div>
                  <span>{item.event_type.replaceAll(".", " / ")}</span>
                  <time>{new Date(item.occurred_at).toLocaleString()}</time>
                </div>
                <h3>{item.summary}</h3>
                <p>
                  {item.source}
                  {item.transaction_hash
                    ? ` · ${short(item.transaction_hash)}`
                    : ""}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </WorkspacePage>
  );
}

export function AlertsPageView() {
  const { project } = useWorkspace();
  const [items, setItems] = useState<Alert[]>([]);
  const [status, setStatus] = useState("open");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await apiRequest<{ alerts: Alert[] }>(
        `/v1/projects/${project.id}/alerts?status=${status}`,
      );
      setItems(r.alerts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load alerts.");
    }
  }, [project.id, status]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const update = async (id: string, next: string) => {
    try {
      await apiRequest(`/v1/projects/${project.id}/alerts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update alert.");
    }
  };
  return (
    <WorkspacePage
      title="Alerts"
      description="Security-relevant and customer-impacting events that require an operator response."
    >
      <div className={styles.content}>
        <div className={styles.filters}>
          <div>
            {["open", "acknowledged", "resolved"].map((value) => (
              <button
                className={status === value ? styles.selected : ""}
                onClick={() => setStatus(value)}
                key={value}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <ErrorMessage value={error} />
        {items.length === 0 ? (
          <Empty
            title={`No ${status} alerts`}
            body="Only events that require attention are promoted from the activity stream."
          />
        ) : (
          <div className={styles.alertList}>
            {items.map((item) => (
              <article key={item.id}>
                <span className={`${styles.severity} ${styles[item.severity]}`}>
                  {item.severity}
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                  <time>{new Date(item.created_at).toLocaleString()}</time>
                </div>
                <div>
                  {status === "open" && (
                    <button onClick={() => update(item.id, "acknowledged")}>
                      Acknowledge
                    </button>
                  )}
                  {status !== "resolved" && (
                    <button onClick={() => update(item.id, "resolved")}>
                      Resolve
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </WorkspacePage>
  );
}
