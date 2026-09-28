"use client";

import { useOrganizationWorkspace } from "@/components/organizations/organization-shell";
import { organizationLabel } from "@/lib/organization-label";
import styles from "../../organizations.module.css";

export default function OrganizationBillingPage() {
  const { organization } = useOrganizationWorkspace();
  if (!organization) return null;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Billing</h1>
          <p>
            Plan and billing information for {organizationLabel(organization.name)}.
          </p>
        </div>
      </header>
      <div className={styles.notice}>
        <h2>Developer preview</h2>
        <p>
          Billing is not enabled during the developer preview. Your organization
          can create projects and use testnet infrastructure without a paid plan.
        </p>
      </div>
    </section>
  );
}
