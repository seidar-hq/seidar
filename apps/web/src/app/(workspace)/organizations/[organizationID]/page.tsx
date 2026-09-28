"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Project } from "@/components/dashboard/dashboard-shell";
import { useOrganizationWorkspace } from "@/components/organizations/organization-shell";
import { apiRequest } from "@/lib/api";
import { projectHref } from "@/lib/routes";
import { organizationLabel } from "@/lib/organization-label";
import styles from "../organizations.module.css";

export default function OrganizationProjectsPage() {
  const { organization } = useOrganizationWorkspace();
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organization) return;
    try {
      const response = await apiRequest<{ projects: Project[] }>(
        `/v1/organizations/${organization.id}/projects`,
      );
      setProjects(response.projects);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load projects.");
    } finally {
      setLoading(false);
    }
  }, [organization]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!organization) return null;

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<{ project: Project }>(
        `/v1/organizations/${organization.id}/projects`,
        { method: "POST", body: JSON.stringify({ name }) },
      );
      setProjects((items) => [...items, response.project]);
      setName("");
      setCreating(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create project.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Projects</h1>
          <p>
            All confidential-asset projects inside {organizationLabel(organization.name)}.
          </p>
        </div>
        <button className={styles.primary} onClick={() => setCreating((value) => !value)}>
          {creating ? "Cancel" : "New project"}
        </button>
      </header>
      {creating && (
        <form className={styles.formCard} onSubmit={createProject}>
          <label>
            Project name
            <input
              autoFocus
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              placeholder="Confidential USD"
              required
              value={name}
            />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.formActions}>
            <button className={styles.primary} disabled={saving} type="submit">
              {saving ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      )}
      {!creating && error && <p className={styles.error}>{error}</p>}
      {loading ? (
        <div className={styles.empty}>Loading projects…</div>
      ) : projects.length === 0 ? (
        <div className={styles.empty}>No projects have been created.</div>
      ) : (
        <div className={styles.grid}>
          {projects.map((project) => (
            <Link className={styles.card} href={projectHref(project.id)} key={project.id}>
              <div className={styles.cardTop}>
                <code>{project.slug}</code>
                <span className={styles.role}>{project.role}</span>
              </div>
              <h2>{project.name}</h2>
              <small>{project.network}</small>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
