"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/dashboard/dashboard-shell";
import WorkspacePage from "@/components/dashboard/workspace-page";
import { apiRequest } from "@/lib/api";
import styles from "./settings.module.css";

type PlatformStatus = {
  network: "testnet";
  lifecycle: "developer_preview";
  implementation_version: string;
  verifier_version: string;
  sdk_version: string;
  protocol_version: string;
  managed_policy_contract_id: string;
  managed_policy_signing_configured: boolean;
};
const compact = (value: string) =>
  value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-9)}` : value;

export default function SettingsPage() {
  const { organization, project, refreshWorkspace } = useWorkspace();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [message, setMessage] = useState("");
  const canManage = project.role === "admin";
  useEffect(() => {
    void apiRequest<{ platform: PlatformStatus }>(
      `/v1/projects/${project.id}/settings`,
    )
      .then((response) => setPlatform(response.platform))
      .catch((reason) =>
        setMessage(
          reason instanceof Error
            ? reason.message
            : "Could not load platform status.",
        ),
      );
  }, [project.id]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("Saving…");
    try {
      await apiRequest(
        `/v1/organizations/${organization.id}/projects/${project.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ name, description }),
        },
      );
      await refreshWorkspace();
      setMessage("Project settings saved.");
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Could not save project settings.",
      );
    }
  };
  return (
    <WorkspacePage
      title="Settings"
      description="Project identity, network boundaries, and the pinned Confidential Token integration used by this workspace."
    >
      <div className={styles.content}>
        <section className={styles.card}>
          <div>
            <span>PROJECT</span>
            <h2>General</h2>
            <p>
              Names and descriptions are visible to members of this
              organization.
            </p>
          </div>
          <form onSubmit={save}>
            <label>
              Project name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                required
                disabled={!canManage}
              />
            </label>
            <label>
              Project description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                disabled={!canManage}
              />
            </label>
            <div className={styles.identifiers}>
              <div>
                <small>Project ID</small>
                <code>{project.id}</code>
              </div>
              <div>
                <small>Organization ID</small>
                <code>{organization.id}</code>
              </div>
            </div>
            {canManage ? (
              <button>Save changes</button>
            ) : (
              <small className={styles.readOnly}>
                Your {project.role} role has read-only access to these settings.
              </small>
            )}
            {message && <p className={styles.message}>{message}</p>}
          </form>
        </section>
        <section className={styles.card}>
          <div>
            <span>STELLAR INTEGRATION</span>
            <h2>Protocol boundary</h2>
            <p>
              Seidar pins preview dependencies so incompatible contract changes
              cannot pass silently.
            </p>
          </div>
          {platform ? (
            <dl>
              <div>
                <dt>Network</dt>
                <dd>{platform.network}</dd>
              </div>
              <div>
                <dt>Lifecycle</dt>
                <dd>{platform.lifecycle.replace("_", " ")}</dd>
              </div>
              <div>
                <dt>CT implementation</dt>
                <dd>
                  <code>{platform.implementation_version}</code>
                </dd>
              </div>
              <div>
                <dt>Verifier</dt>
                <dd>
                  <code>{platform.verifier_version}</code>
                </dd>
              </div>
              <div>
                <dt>Canonical SDK</dt>
                <dd>
                  <code>{platform.sdk_version}</code>
                </dd>
              </div>
              <div>
                <dt>Managed policy</dt>
                <dd>
                  <code title={platform.managed_policy_contract_id}>
                    {compact(platform.managed_policy_contract_id)}
                  </code>
                </dd>
              </div>
              <div>
                <dt>Testnet signer</dt>
                <dd data-ready={platform.managed_policy_signing_configured}>
                  {platform.managed_policy_signing_configured
                    ? "Secure identity ready"
                    : "Not configured"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className={styles.loading}>Loading pinned integration…</p>
          )}
          <div className={styles.warning}>
            <b>Developer preview</b>
            <span>
              Confidential Tokens are testnet-only and unaudited. This
              environment must not hold production value or customer signing
              secrets.
            </span>
          </div>
        </section>
      </div>
    </WorkspacePage>
  );
}
