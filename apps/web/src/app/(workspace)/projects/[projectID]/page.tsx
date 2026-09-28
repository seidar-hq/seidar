"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/components/dashboard/dashboard-shell";
import WorkspacePage from "@/components/dashboard/workspace-page";
import { apiRequest } from "@/lib/api";
import { projectHref } from "@/lib/routes";
import styles from "./dashboard.module.css";

type Activity = {
  id: string;
  event_type: string;
  source: "seidar" | "stellar" | "external";
  summary: string;
  transaction_hash?: string;
  occurred_at: string;
};
type Alert = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  created_at: string;
};
type Overview = {
  metrics: {
    assets: number;
    active_assets: number;
    policies: number;
    auditors: number;
    open_alerts: number;
    protected_assets: number;
    indexed_events: number;
  };
  recent_activity: Activity[];
  open_alerts: Alert[];
};
const short = (value?: string) =>
  value && value.length > 18
    ? `${value.slice(0, 9)}…${value.slice(-7)}`
    : value || "—";

export default function DashboardPage() {
  const { project } = useWorkspace();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await apiRequest<{ overview: Overview }>(
        `/v1/projects/${project.id}/overview`,
      );
      setOverview(response.overview);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load overview.",
      );
    }
  }, [project.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <WorkspacePage
      title="Home"
      description="Live operational state for this project, including assets, controls, alerts, and recovery coverage."
      hideHeader
    >
      {error && <p className={styles.error}>{error}</p>}
      {!overview ? (
        <div className={styles.loading}>Loading project telemetry…</div>
      ) : (
        <div className={styles.content}>
          <div className={styles.metrics}>
            <article>
              <span>Assets</span>
              <strong>{overview.metrics.assets}</strong>
              <small>{overview.metrics.active_assets} active</small>
            </article>
            <article>
              <span>Policies</span>
              <strong>{overview.metrics.policies}</strong>
              <small>active controls</small>
            </article>
            <article>
              <span>Auditors</span>
              <strong>{overview.metrics.auditors}</strong>
              <small>active configurations</small>
            </article>
            <article
              className={overview.metrics.open_alerts ? styles.attention : ""}
            >
              <span>Open alerts</span>
              <strong>{overview.metrics.open_alerts}</strong>
              <small>requiring review</small>
            </article>
          </div>
          <section className={styles.recovery}>
            <div>
              <span>RECOVERY PROTECTION</span>
              <h2>
                {overview.metrics.protected_assets} of {overview.metrics.assets}{" "}
                assets protected
              </h2>
              <p>
                Durable encrypted event history is retained for replay without
                exposing private balances or transfer amounts.
              </p>
            </div>
            <strong>
              {overview.metrics.indexed_events.toLocaleString()}
              <small> indexed events</small>
            </strong>
          </section>
          <div className={styles.columns}>
            <section>
              <header>
                <div>
                  <span>RECENT</span>
                  <h2>Operational activity</h2>
                </div>
                <Link href={projectHref(project.id, "activity")}>
                  View all →
                </Link>
              </header>
              {overview.recent_activity.length === 0 ? (
                <p className={styles.empty}>
                  Activity will appear as your team configures and operates
                  assets.
                </p>
              ) : (
                overview.recent_activity.map((item) => (
                  <article className={styles.activity} key={item.id}>
                    <i data-source={item.source} />
                    <div>
                      <strong>{item.summary}</strong>
                      <span>
                        {item.event_type} ·{" "}
                        {new Date(item.occurred_at).toLocaleString()}
                      </span>
                    </div>
                    <code title={item.transaction_hash}>
                      {short(item.transaction_hash)}
                    </code>
                  </article>
                ))
              )}
            </section>
            <aside>
              <header>
                <div>
                  <span>ATTENTION</span>
                  <h2>Open alerts</h2>
                </div>
                <Link href={projectHref(project.id, "alerts")}>View all →</Link>
              </header>
              {overview.open_alerts.length === 0 ? (
                <p className={styles.empty}>No open operational alerts.</p>
              ) : (
                overview.open_alerts.map((item) => (
                  <article className={styles.alert} key={item.id}>
                    <span data-severity={item.severity}>{item.severity}</span>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </article>
                ))
              )}
            </aside>
          </div>
        </div>
      )}
    </WorkspacePage>
  );
}
