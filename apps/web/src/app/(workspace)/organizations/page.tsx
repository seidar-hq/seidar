"use client";

import Link from "next/link";
import { useOrganizationWorkspace } from "@/components/organizations/organization-shell";
import { organizationLabel } from "@/lib/organization-label";
import styles from "./organizations.module.css";

export default function OrganizationsPage() {
  const { organizations } = useOrganizationWorkspace();

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Organizations</h1>
          <p>Select an organization to view its projects, members, billing, and settings.</p>
        </div>
        <Link className={styles.primary} href="/organizations/new">
          New organization
        </Link>
      </header>
      {organizations.length === 0 ? (
        <div className={styles.empty}>
          <div>
            <p>You have not created an organization yet.</p>
            <Link className={styles.primary} href="/organizations/new">
              Create organization
            </Link>
          </div>
        </div>
      ) : (
        <div className={styles.grid}>
          {organizations.map((organization) => (
            <Link
              className={styles.card}
              href={`/organizations/${organization.id}`}
              key={organization.id}
            >
              <div className={styles.cardTop}>
                <code>{organization.slug}</code>
                <span className={styles.role}>{organization.role}</span>
              </div>
              <h2>{organizationLabel(organization.name)}</h2>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
