"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Organization } from "@/components/dashboard/dashboard-shell";
import { useOrganizationWorkspace } from "@/components/organizations/organization-shell";
import { apiRequest } from "@/lib/api";
import styles from "../organizations.module.css";

export default function NewOrganizationPage() {
  const router = useRouter();
  const { refreshOrganizations } = useOrganizationWorkspace();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<{ organization: Organization }>(
        "/v1/organizations",
        { method: "POST", body: JSON.stringify({ name }) },
      );
      localStorage.setItem("seidar_organization_id", response.organization.id);
      await refreshOrganizations();
      router.replace(`/organizations/${response.organization.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not create organization.",
      );
      setSaving(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Create an organization</h1>
          <p>Organizations contain projects, members, access controls, and billing.</p>
        </div>
      </header>
      <form className={styles.formCard} onSubmit={submit}>
        <label>
          Organization name
          <input
            autoFocus
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder="Northstar Treasury"
            required
            value={name}
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.formActions}>
          <button className={styles.primary} disabled={saving} type="submit">
            {saving ? "Creating…" : "Create organization"}
          </button>
          <Link className={styles.secondary} href="/organizations">
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
