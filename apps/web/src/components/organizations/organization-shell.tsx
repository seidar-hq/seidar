"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import ContextDoubleChevron from "@/components/dashboard/context-double-chevron";
import { APIError, apiRequest, type User } from "@/lib/api";
import type { Organization } from "@/components/dashboard/dashboard-shell";
import { organizationLabel } from "@/lib/organization-label";
import styles from "@/components/dashboard/dashboard-shell.module.css";

type OrganizationWorkspaceContextValue = {
  user: User;
  organizations: Organization[];
  organization: Organization | null;
  refreshOrganizations: () => Promise<void>;
};

const OrganizationWorkspaceContext =
  createContext<OrganizationWorkspaceContextValue | null>(null);

export function useOrganizationWorkspace() {
  const value = useContext(OrganizationWorkspaceContext);
  if (!value) {
    throw new Error(
      "useOrganizationWorkspace must be used inside OrganizationShell",
    );
  }
  return value;
}

const detailNavigation = [
  { label: "Projects", section: "" },
  { label: "Members", section: "members" },
  { label: "Billing", section: "billing" },
  { label: "Settings", section: "settings" },
];

function OrganizationIcon({ section }: { section: string }) {
  if (section === "members") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="8" r="4.2" />
        <path d="M2.5 21v-2.1a5 5 0 0 1 5-5h1a5 5 0 0 1 5 5V21Zm12.2-7.4a3.7 3.7 0 1 0 0-7.4 5.8 5.8 0 0 1 0 7.4ZM14.4 21h7.1v-1.7a4.7 4.7 0 0 0-5.9-4.5 6.8 6.8 0 0 1-1.2 6.2Z" />
        <path d="M2.5 21v-2.1a5 5 0 0 1 5-5h1Z" className={styles.iconTone} />
      </svg>
    );
  }
  if (section === "billing") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
        <path d="M2 8h20v3H2Zm4 6h6v2H6Z" className={styles.iconTone} />
      </svg>
    );
  }
  if (section === "settings") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.1 12.9c.1-.6.1-1.2 0-1.8l2-1.6-2-3.5-2.5 1a8 8 0 0 0-1.6-.9L14.6 3h-5l-.4 3.1c-.6.2-1.1.5-1.6.9L5.1 6l-2 3.5 2 1.6a7 7 0 0 0 0 1.8l-2 1.6 2 3.5 2.5-1c.5.4 1 .7 1.6.9l.4 3.1h5l.4-3.1c.6-.2 1.1-.5 1.6-.9l2.5 1 2-3.5ZM12 15.7a3.7 3.7 0 1 1 0-7.4 3.7 3.7 0 0 1 0 7.4Z" />
        <circle cx="12" cy="12" r="2.1" className={styles.iconTone} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 2.8 9 4.7-9 4.7-9-4.7Zm-7.8 9L12 16l7.8-4.2L21 14l-9 4.8L3 14Zm0 5L12 21l7.8-4.2L21 19l-9 4.8L3 19Z" />
      <path d="m12 12.2 9-4.7L12 2.8Z" className={styles.iconTone} />
    </svg>
  );
}

export default function OrganizationShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ organizationID?: string | string[] }>();
  const organizationID =
    typeof params.organizationID === "string"
      ? params.organizationID
      : undefined;
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  const refreshOrganizations = useCallback(async () => {
    const response = await apiRequest<{ organizations: Organization[] }>(
      "/v1/organizations",
    );
    setOrganizations(response.organizations);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [me, response] = await Promise.all([
          apiRequest<{ user: User }>("/v1/auth/me"),
          apiRequest<{ organizations: Organization[] }>("/v1/organizations"),
        ]);
        if (!active) return;
        setUser(me.user);
        setOrganizations(response.organizations);
        setError("");
      } catch (reason) {
        if (reason instanceof APIError && reason.status === 401) {
          router.replace("/signin");
          return;
        }
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load organizations.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!selectorOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!selectorRef.current?.contains(event.target as Node)) {
        setSelectorOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [selectorOpen]);

  const organization =
    organizations.find((item) => item.id === organizationID) ?? null;
  const detailBase = organization
    ? `/organizations/${organization.id}`
    : "/organizations";

  const signOut = async () => {
    await apiRequest("/v1/auth/signout", { method: "POST" });
    localStorage.removeItem("seidar_organization_id");
    localStorage.removeItem("seidar_project_id");
    router.replace("/signin");
  };

  return (
    <div className={`${styles.shell} ${collapsed ? styles.collapsed : ""}`}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <Link
            href="/organizations"
            className={styles.brand}
            aria-label="Seidar organizations"
          >
            <Image src="/logo.png" alt="" width={24} height={24} priority />
            <span>Seidar</span>
          </Link>
          <button
            className={`${styles.iconButton} ${styles.collapseButton}`}
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((current) => !current)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
            </svg>
          </button>
        </div>
        <nav className={styles.navigation} aria-label="Organization navigation">
          {(organization
            ? detailNavigation
            : [
                { label: "Organizations", section: "" },
                { label: "New organization", section: "new" },
              ]
          ).map((item) => {
            const href = organization
              ? `${detailBase}${item.section ? `/${item.section}` : ""}`
              : `/organizations${item.section ? `/${item.section}` : ""}`;
            return (
              <Link
                className={`${styles.navigationItem} ${pathname === href ? styles.active : ""}`}
                href={href}
                key={item.label}
              >
                <OrganizationIcon section={item.section} />
                <span className={styles.navigationText}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className={styles.sidebarBottom}>
          <button
            type="button"
            className={styles.userButton}
            onClick={signOut}
            title="Sign out"
          >
            <span>
              {user?.name?.slice(0, 1).toUpperCase() ||
                user?.email?.slice(0, 1).toUpperCase() ||
                "S"}
            </span>
            <span className={styles.navigationText}>
              {user?.email ?? "Sign out"}
            </span>
          </button>
        </div>
      </aside>
      <main className={styles.panel}>
        <header className={styles.panelHeader}>
          <div className={styles.contextSelectors} ref={selectorRef}>
            {organization ? (
              <div className={styles.contextGroup}>
                <Link className={styles.contextName} href={detailBase}>
                  {organizationLabel(organization.name)}
                </Link>
                <button
                  type="button"
                  className={styles.contextCaret}
                  aria-label="Choose organization"
                  aria-expanded={selectorOpen}
                  onClick={() => setSelectorOpen((open) => !open)}
                >
                  <ContextDoubleChevron />
                </button>
                {selectorOpen && (
                  <div className={styles.selectorMenu}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectorOpen(false);
                        router.push("/organizations");
                      }}
                    >
                      <span>All organizations</span>
                    </button>
                    {organizations.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => {
                          setSelectorOpen(false);
                          localStorage.setItem("seidar_organization_id", item.id);
                          router.push(`/organizations/${item.id}`);
                        }}
                      >
                        <span>{organizationLabel(item.name)}</span>
                        <small>{item.role}</small>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectorOpen(false);
                        router.push("/organizations/new");
                      }}
                    >
                      <span>+ New organization</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link className={styles.contextButton} href="/organizations">
                All organizations
              </Link>
            )}
          </div>
          {organization && (
            <span className={styles.networkBadge}>{organization.role}</span>
          )}
        </header>
        <div className={styles.panelContent}>
          {loading && <div className={styles.loading}>Loading organizations…</div>}
          {!loading && error && <div className={styles.loading}>{error}</div>}
          {!loading && !error && user && organizationID && !organization && (
            <div className={styles.loading}>
              This organization is unavailable or you do not have access.
            </div>
          )}
          {!loading && !error && user && (!organizationID || organization) && (
            <OrganizationWorkspaceContext.Provider
              value={{
                user,
                organizations,
                organization,
                refreshOrganizations,
              }}
            >
              {children}
            </OrganizationWorkspaceContext.Provider>
          )}
        </div>
      </main>
    </div>
  );
}
