"use client";

import { useOrganizationWorkspace } from "@/components/organizations/organization-shell";
import { organizationLabel } from "@/lib/organization-label";
import styles from "../../organizations.module.css";

export default function OrganizationSettingsPage() {
  const { organization } = useOrganizationWorkspace();
  if (!organization) return null;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Settings</h1>
          <p>Organization identity and access information.</p>
        </div>
      </header>
      <dl className={styles.details}>
        <div>
          <dt>Name</dt>
          <dd>{organizationLabel(organization.name)}</dd>
        </div>
        <div>
          <dt>Slug</dt>
          <dd>{organization.slug}</dd>
        </div>
        <div>
          <dt>Organization ID</dt>
          <dd><code>{organization.id}</code></dd>
        </div>
        <div>
          <dt>Your role</dt>
          <dd>{organization.role}</dd>
        </div>
      </dl>
    </section>
  );
}
