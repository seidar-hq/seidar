"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { APIError, apiRequest, type User } from "@/lib/api";
import { organizationLabel } from "@/lib/organization-label";
import { projectHref } from "@/lib/routes";
import ContextDoubleChevron from "./context-double-chevron";
import styles from "./dashboard-shell.module.css";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member" | "viewer";
  created_at: string;
};

export type Project = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string;
  network: "testnet";
  role: "admin" | "operator" | "developer" | "viewer";
  created_at: string;
};

type WorkspaceContextValue = {
  user: User;
  organization: Organization;
  project: Project;
  organizations: Organization[];
  projects: Project[];
  refreshWorkspace: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside DashboardShell");
  }
  return value;
}

type IconName =
  | "overview"
  | "assets"
  | "policies"
  | "auditors"
  | "activity"
  | "alerts"
  | "integrations"
  | "settings";

const navigation: { label: string; section?: string; icon: IconName }[] = [
  { label: "Home", icon: "overview" },
  { label: "Assets", section: "assets", icon: "assets" },
  { label: "Policies", section: "policies", icon: "policies" },
  { label: "Auditors", section: "auditors", icon: "auditors" },
  { label: "Activity", section: "activity", icon: "activity" },
  { label: "Alerts", section: "alerts", icon: "alerts" },
  { label: "Integrations", section: "integrations", icon: "integrations" },
  { label: "Settings", section: "settings", icon: "settings" },
];

function NavigationIcon({ name }: { name: IconName }) {
  if (name === "overview")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.4 20 9.7v8.1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9.7Z" />
        <path d="M12.8 19.8v-6.3l-3.2 2.4v3.9Z" className={styles.iconTone} />
      </svg>
    );
  if (name === "assets")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 2.8 9 4.7-9 4.7-9-4.7Zm-7.8 9L12 16l7.8-4.2L21 14l-9 4.8L3 14Zm0 5L12 21l7.8-4.2L21 19l-9 4.8L3 19Z" />
        <path d="m12 12.2 9-4.7L12 2.8Z" className={styles.iconTone} />
      </svg>
    );
  if (name === "policies")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2 20 5.4v6.4c0 6.4-8 10.2-8 10.2S4 18.2 4 11.8V5.4Z" />
        <path d="m8.3 12.1 2.4 2.5 5.2-5.3-1.5-1.5-3.7 3.8-.9-1Z" className={styles.iconCutout} />
      </svg>
    );
  if (name === "auditors")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="4.5" />
        <path d="M2.8 21v-2.2a5 5 0 0 1 5-5h2.4a5 5 0 0 1 5 5V21Z" />
        <path d="m15.6 12.4 2.1 2.1 4.1-4.2v6.1a2 2 0 0 1-2 2h-4.2Z" className={styles.iconTone} />
      </svg>
    );
  if (name === "activity")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10.8h3.1L8.8 4l4.7 12 2.4-6H21v3.2h-3l-4.6 7.2L8.7 8.8l-1.2 5.1H3Z" />
        <path d="m13.5 16 2.4-6H21v3.2h-3l-3 4.7Z" className={styles.iconTone} />
      </svg>
    );
  if (name === "alerts")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.4a6 6 0 0 1 6 6v3.3c0 2.3.8 3.5 2.4 5.3.7.8.1 2-1 2H4.6c-1.1 0-1.7-1.2-1-2C5.2 15.2 6 14 6 11.7V8.4a6 6 0 0 1 6-6Z" />
        <path d="M9.4 20h5.2a2.7 2.7 0 0 1-5.2 0Z" className={styles.iconTone} />
      </svg>
    );
  if (name === "integrations")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 3.5h6.7v6.7H4Zm9.3 0H20v6.7h-6.7ZM4 13.8h6.7v6.7H4Zm11.8.3h1.7v2.4H20v1.7h-2.5v2.4h-1.7v-2.4h-2.5v-1.7h2.5Z" />
        <path d="M5.7 5.2H9v3.3H5.7Zm9.3 0h3.3v3.3H15Z" className={styles.iconTone} />
      </svg>
    );
  if (name === "settings")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.1 12.9c.1-.6.1-1.2 0-1.8l2-1.6-2-3.5-2.5 1a8 8 0 0 0-1.6-.9L14.6 3h-5l-.4 3.1c-.6.2-1.1.5-1.6.9L5.1 6l-2 3.5 2 1.6a7 7 0 0 0 0 1.8l-2 1.6 2 3.5 2.5-1c.5.4 1 .7 1.6.9l.4 3.1h5l.4-3.1c.6-.2 1.1-.5 1.6-.9l2.5 1 2-3.5ZM12 15.7a3.7 3.7 0 1 1 0-7.4 3.7 3.7 0 0 1 0 7.4Z" />
        <circle cx="12" cy="12" r="2.1" className={styles.iconTone} />
      </svg>
    );
  return null;
}

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ projectID?: string | string[] }>();
  const routeProjectID =
    typeof params.projectID === "string" ? params.projectID : undefined;
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [selector, setSelector] = useState<"organization" | "project" | null>(
    null,
  );
  const selectorRef = useRef<HTMLDivElement>(null);

  const refreshWorkspace = async () => {
    const response = await apiRequest<{ organizations: Organization[] }>(
      "/v1/organizations",
    );
    setOrganizations(response.organizations);
    const preferredOrganizationID = localStorage.getItem(
      "seidar_organization_id",
    );
    const preferredOrganization =
      response.organizations.find(
        (item) => item.id === preferredOrganizationID,
      ) ??
      response.organizations[0] ??
      null;
    let nextOrganization = preferredOrganization;
    let nextProjects: Project[] = [];
    let nextProject: Project | null = null;

    if (routeProjectID) {
      const orderedOrganizations = preferredOrganization
        ? [
            preferredOrganization,
            ...response.organizations.filter(
              (item) => item.id !== preferredOrganization.id,
            ),
          ]
        : response.organizations;
      for (const candidate of orderedOrganizations) {
        const projectResponse = await apiRequest<{ projects: Project[] }>(
          `/v1/organizations/${candidate.id}/projects`,
        );
        const routeProject = projectResponse.projects.find(
          (item) => item.id === routeProjectID,
        );
        if (routeProject) {
          nextOrganization = candidate;
          nextProjects = projectResponse.projects;
          nextProject = routeProject;
          break;
        }
        if (candidate.id === preferredOrganization?.id) {
          nextProjects = projectResponse.projects;
        }
      }
    } else if (nextOrganization) {
      const projectResponse = await apiRequest<{ projects: Project[] }>(
        `/v1/organizations/${nextOrganization.id}/projects`,
      );
      nextProjects = projectResponse.projects;
      const preferredProjectID = localStorage.getItem("seidar_project_id");
      nextProject =
        nextProjects.find((item) => item.id === preferredProjectID) ??
        nextProjects[0] ??
        null;
    }

    setOrganization(nextOrganization);
    if (nextOrganization) {
      localStorage.setItem("seidar_organization_id", nextOrganization.id);
      setProjects(nextProjects);
      setProject(nextProject);
      if (nextProject) {
        localStorage.setItem("seidar_project_id", nextProject.id);
      }
    } else {
      setProjects([]);
      setProject(null);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await apiRequest<{ user: User }>("/v1/auth/me");
        if (!active) return;
        setUser(me.user);
        await refreshWorkspace();
      } catch (reason) {
        if (reason instanceof APIError && reason.status === 401) {
          router.replace("/signin");
          return;
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // The initial load intentionally runs once for this mounted workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!selector) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!selectorRef.current?.contains(event.target as Node)) {
        setSelector(null);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [selector]);

  const selectOrganization = (nextOrganization: Organization) => {
    setOrganization(nextOrganization);
    localStorage.setItem("seidar_organization_id", nextOrganization.id);
    setSelector(null);
    router.push(`/organizations/${nextOrganization.id}`);
  };

  const signOut = async () => {
    await apiRequest("/v1/auth/signout", { method: "POST" });
    localStorage.removeItem("seidar_organization_id");
    localStorage.removeItem("seidar_project_id");
    router.replace("/signin");
  };

  const resendVerification = async () => {
    setVerificationMessage("Sending…");
    try {
      await apiRequest("/v1/auth/verification/request", { method: "POST" });
      setVerificationMessage("Verification email sent.");
    } catch (reason) {
      setVerificationMessage(
        reason instanceof Error
          ? reason.message
          : "Could not send verification email.",
      );
    }
  };

  const ready = user && organization && project;
  const currentSection = pathname.match(
    /^\/projects\/[^/]+\/([^/]+)/,
  )?.[1];

  return (
    <div className={`${styles.shell} ${collapsed ? styles.collapsed : ""}`}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <Link
            href={project ? projectHref(project.id) : "/organizations"}
            className={styles.brand}
            aria-label="Seidar workspace"
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
        <nav className={styles.navigation} aria-label="Dashboard navigation">
          {navigation.map((item) => {
            const href = project
              ? projectHref(project.id, item.section)
              : "/organizations";
            const active =
              pathname === href ||
              (item.section === "assets" && pathname.startsWith(`${href}/`));
            return (
              <Link
                className={`${styles.navigationItem} ${active ? styles.active : ""}`}
                href={href}
                title={item.label}
                key={item.label}
              >
                <NavigationIcon name={item.icon} />
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
            {organization && project && (
              <>
                <div className={styles.contextGroup}>
              {organization ? (
                <Link
                  className={styles.contextName}
                  href={`/organizations/${organization.id}`}
                >
                  {organizationLabel(organization.name)}
                </Link>
              ) : (
                <span className={styles.contextName}>Organization</span>
              )}
              <button
                type="button"
                className={styles.contextCaret}
                disabled={!organization}
                aria-label="Choose organization"
                aria-expanded={selector === "organization"}
                onClick={() =>
                  setSelector(selector === "organization" ? null : "organization")
                }
              >
                <ContextDoubleChevron />
              </button>
              {selector === "organization" && (
                <div className={styles.selectorMenu}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelector(null);
                      router.push("/organizations");
                    }}
                  >
                    <span>All organizations</span>
                  </button>
                  {organizations.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => selectOrganization(item)}
                    >
                      <span>{organizationLabel(item.name)}</span>
                      <small>{item.role}</small>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setSelector(null);
                      router.push("/organizations/new");
                    }}
                  >
                    + New organization
                  </button>
                </div>
              )}
                </div>
                <span className={styles.separator}>/</span>
                <div className={styles.contextGroup}>
              <button
                type="button"
                className={styles.contextName}
                disabled={!project}
                onClick={() =>
                  setSelector(selector === "project" ? null : "project")
                }
              >
                {project?.name ?? "Project"}
              </button>
              <button
                type="button"
                className={styles.contextCaret}
                disabled={!project}
                aria-label="Choose project"
                aria-expanded={selector === "project"}
                onClick={() =>
                  setSelector(selector === "project" ? null : "project")
                }
              >
                <ContextDoubleChevron />
              </button>
              {selector === "project" && (
                <div className={styles.selectorMenu}>
                  {projects.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => {
                        setProject(item);
                        localStorage.setItem("seidar_project_id", item.id);
                        setSelector(null);
                        router.push(projectHref(item.id, currentSection));
                      }}
                    >
                      <span>{item.name}</span>
                      <small>{item.network}</small>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setSelector(null);
                      if (organization) {
                        router.push(`/organizations/${organization.id}`);
                      }
                    }}
                  >
                    + New project
                  </button>
                </div>
              )}
                </div>
              </>
            )}
          </div>
          {project && <span className={styles.networkBadge}>TESTNET</span>}
        </header>
        {user && !user.email_verified_at && (
          <div className={styles.verificationBanner}>
            <span>
              Verify your email to secure recovery and team invitations.
            </span>
            <button type="button" onClick={resendVerification}>
              Resend email
            </button>
            {verificationMessage && <small>{verificationMessage}</small>}
          </div>
        )}
        <div className={styles.panelContent}>
          {loading && <div className={styles.loading}>Loading workspace…</div>}
          {!loading && !user && (
            <div className={styles.loading}>Redirecting to sign in…</div>
          )}
          {!loading && user && !ready && (
            <div className={styles.loading}>
              This project is unavailable or you do not have access.
            </div>
          )}
          {!loading && ready && (
            <WorkspaceContext.Provider
              value={{
                user,
                organization,
                project,
                organizations,
                projects,
                refreshWorkspace,
              }}
            >
              {children}
            </WorkspaceContext.Provider>
          )}
        </div>
      </main>
    </div>
  );
}
