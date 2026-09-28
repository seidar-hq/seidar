"use client";
import { useCallback, useEffect, useState } from "react";
import WorkspacePage from "@/components/dashboard/workspace-page";
import { useWorkspace } from "@/components/dashboard/dashboard-shell";
import { apiRequest } from "@/lib/api";
import styles from "./integrations.module.css";

type APIKey = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at?: string;
  revoked_at?: string;
  created_at: string;
};
type Webhook = {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  created_at: string;
};
const scopes = [
  "assets:read",
  "assets:write",
  "policies:read",
  "policies:write",
  "auditors:read",
  "auditors:write",
  "disclosures:read",
  "disclosures:request",
  "disclosures:approve",
  "disclosures:write",
  "activity:read",
  "alerts:read",
  "alerts:write",
  "webhooks:write",
];
const events = [
  "asset.created",
  "asset.inspected",
  "asset.unsupported",
  "account.added",
  "account.updated",
  "policy.created",
  "auditor.created",
  "auditor.assigned",
  "disclosure.created",
  "disclosure.approved",
  "disclosure.rejected",
  "disclosure.bundle_attached",
  "disclosure.completed",
];
export default function IntegrationsPage() {
  const { project } = useWorkspace();
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [keyName, setKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState([
    "assets:read",
    "activity:read",
  ]);
  const [url, setURL] = useState("");
  const [selectedEvents, setSelectedEvents] = useState(["asset.created"]);
  const load = useCallback(async () => {
    try {
      const [k, w] = await Promise.all([
        apiRequest<{ api_keys: APIKey[] }>(
          `/v1/projects/${project.id}/api-keys`,
        ),
        apiRequest<{ webhooks: Webhook[] }>(
          `/v1/projects/${project.id}/webhooks`,
        ),
      ]);
      setKeys(k.api_keys);
      setWebhooks(w.webhooks);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load integrations.",
      );
    }
  }, [project.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const toggle = (
    value: string,
    current: string[],
    set: (v: string[]) => void,
  ) =>
    set(
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    );
  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await apiRequest<{ key: string }>(
        `/v1/projects/${project.id}/api-keys`,
        {
          method: "POST",
          body: JSON.stringify({ name: keyName, scopes: selectedScopes }),
        },
      );
      setSecret(response.key);
      setKeyName("");
      await load();
    } catch (x) {
      setError(x instanceof Error ? x.message : "Could not create API key.");
    }
  };
  const createWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await apiRequest<{ signing_secret: string }>(
        `/v1/projects/${project.id}/webhooks`,
        {
          method: "POST",
          body: JSON.stringify({ url, events: selectedEvents }),
        },
      );
      setSecret(response.signing_secret);
      setURL("");
      await load();
    } catch (x) {
      setError(x instanceof Error ? x.message : "Could not create webhook.");
    }
  };
  const remove = async (kind: "api-keys" | "webhooks", id: string) => {
    await apiRequest(`/v1/projects/${project.id}/${kind}/${id}`, {
      method: "DELETE",
    });
    await load();
  };
  return (
    <WorkspacePage
      title="Integrations"
      description="Create scoped API credentials and signed operational webhooks."
    >
      <div className={styles.content}>
        {error && <p className={styles.error}>{error}</p>}
        {secret && (
          <div className={styles.secret}>
            <div>
              <b>Copy this secret now</b>
              <span>
                It is stored encrypted or hashed and will not be shown again.
              </span>
            </div>
            <code>{secret}</code>
            <button onClick={() => navigator.clipboard.writeText(secret)}>
              Copy
            </button>
          </div>
        )}
        <div className={styles.columns}>
          <section>
            <h2>API keys</h2>
            <p>Keys are restricted to this project and the selected scopes.</p>
            <form onSubmit={createKey}>
              <input
                required
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="Wallet integration"
              />
              <div className={styles.choices}>
                {scopes.map((scope) => (
                  <label key={scope}>
                    <input
                      type="checkbox"
                      checked={selectedScopes.includes(scope)}
                      onChange={() =>
                        toggle(scope, selectedScopes, setSelectedScopes)
                      }
                    />
                    {scope}
                  </label>
                ))}
              </div>
              <button>Create API key</button>
            </form>
            <div className={styles.list}>
              {keys.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <code>{item.key_prefix}…</code>
                  </div>
                  <small>{item.scopes.join(" · ")}</small>
                  {!item.revoked_at && (
                    <button onClick={() => remove("api-keys", item.id)}>
                      Revoke
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
          <section>
            <h2>Webhooks</h2>
            <p>Events are signed with HMAC-SHA256 and retried with backoff.</p>
            <form onSubmit={createWebhook}>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setURL(e.target.value)}
                placeholder="https://example.com/seidar-events"
              />
              <div className={styles.choices}>
                {events.map((event) => (
                  <label key={event}>
                    <input
                      type="checkbox"
                      checked={selectedEvents.includes(event)}
                      onChange={() =>
                        toggle(event, selectedEvents, setSelectedEvents)
                      }
                    />
                    {event}
                  </label>
                ))}
              </div>
              <button>Create webhook</button>
            </form>
            <div className={styles.list}>
              {webhooks.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.url}</strong>
                    <small>{item.events.join(" · ")}</small>
                  </div>
                  <button onClick={() => remove("webhooks", item.id)}>
                    Delete
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </WorkspacePage>
  );
}
