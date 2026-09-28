"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project } from "@/components/dashboard/dashboard-shell";
import { useOrganizationWorkspace } from "@/components/organizations/organization-shell";
import { apiRequest } from "@/lib/api";
import styles from "../../organizations.module.css";

type Member = {
  user_id: string;
  email: string;
  name: string;
  organization_role: "owner" | "admin" | "member" | "viewer";
  project_role?: "admin" | "operator" | "developer" | "viewer";
  joined_at: string;
};

type Invitation = {
  id: string;
  email: string;
  organization_role: string;
  project_id?: string;
  project_role?: string;
  expires_at: string;
  accepted_at?: string;
  revoked_at?: string;
};

export default function OrganizationMembersPage() {
  const { organization } = useOrganizationWorkspace();
  const [members, setMembers] = useState<Member[]>([]);
  const [projectMembers, setProjectMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectID, setSelectedProjectID] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [organizationRole, setOrganizationRole] = useState("member");
  const [projectRole, setProjectRole] = useState("developer");
  const [acceptURL, setAcceptURL] = useState("");
  const [loading, setLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(false);
  const [error, setError] = useState("");
  const canManage =
    organization?.role === "owner" || organization?.role === "admin";

  const loadOrganization = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    try {
      const [memberResponse, projectResponse, invitationResponse] =
        await Promise.all([
          apiRequest<{ members: Member[] }>(
            `/v1/organizations/${organization.id}/members`,
          ),
          apiRequest<{ projects: Project[] }>(
            `/v1/organizations/${organization.id}/projects`,
          ),
          canManage
            ? apiRequest<{ invitations: Invitation[] }>(
                `/v1/organizations/${organization.id}/invitations`,
              )
            : Promise.resolve({ invitations: [] }),
        ]);
      setMembers(memberResponse.members);
      setProjects(projectResponse.projects);
      setSelectedProjectID((current) =>
        projectResponse.projects.some((project) => project.id === current)
          ? current
          : (projectResponse.projects[0]?.id ?? ""),
      );
      setInvitations(invitationResponse.invitations);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load members.",
      );
    } finally {
      setLoading(false);
    }
  }, [canManage, organization]);

  const loadProjectMembers = useCallback(async () => {
    if (!organization || !selectedProjectID) {
      setProjectMembers([]);
      return;
    }
    setProjectLoading(true);
    try {
      const response = await apiRequest<{ members: Member[] }>(
        `/v1/organizations/${organization.id}/projects/${selectedProjectID}/members`,
      );
      setProjectMembers(response.members);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load project access.",
      );
    } finally {
      setProjectLoading(false);
    }
  }, [organization, selectedProjectID]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOrganization();
  }, [loadOrganization]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProjectMembers();
  }, [loadProjectMembers]);

  const selectedProject =
    projects.find((project) => project.id === selectedProjectID) ?? null;
  const projectRoles = useMemo(
    () =>
      new Map(
        projectMembers.map((member) => [member.user_id, member.project_role]),
      ),
    [projectMembers],
  );

  if (!organization) return null;

  const refreshAccess = async () => {
    await Promise.all([loadOrganization(), loadProjectMembers()]);
  };

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setAcceptURL("");
    try {
      const response = await apiRequest<{ accept_url: string }>(
        `/v1/organizations/${organization.id}/invitations`,
        {
          method: "POST",
          body: JSON.stringify({
            email,
            organization_role: organizationRole,
            ...(selectedProjectID && projectRole !== "none"
              ? { project_id: selectedProjectID, project_role: projectRole }
              : {}),
          }),
        },
      );
      setAcceptURL(response.accept_url);
      setEmail("");
      await loadOrganization();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not create invitation.",
      );
    }
  };

  const updateOrganizationRole = async (member: Member, role: string) => {
    setError("");
    try {
      await apiRequest(
        `/v1/organizations/${organization.id}/members/${member.user_id}`,
        { method: "PATCH", body: JSON.stringify({ role }) },
      );
      await loadOrganization();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update organization role.",
      );
    }
  };

  const updateProjectRole = async (member: Member, role: string) => {
    if (!selectedProjectID) return;
    setError("");
    try {
      const endpoint = `/v1/organizations/${organization.id}/projects/${selectedProjectID}/members/${member.user_id}`;
      if (role === "none") {
        await apiRequest(endpoint, { method: "DELETE" });
      } else {
        await apiRequest(endpoint, {
          method: "PUT",
          body: JSON.stringify({ role }),
        });
      }
      await refreshAccess();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update project access.",
      );
    }
  };

  const revoke = async (invitationID: string) => {
    try {
      await apiRequest(
        `/v1/organizations/${organization.id}/invitations/${invitationID}`,
        { method: "DELETE" },
      );
      await loadOrganization();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not revoke invitation.",
      );
    }
  };

  const projectName = (projectID?: string) =>
    projects.find((project) => project.id === projectID)?.name ?? "No project";

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Members</h1>
          <p>
            Manage organization membership, invitations, and access to each
            project from one place.
          </p>
        </div>
      </header>

      {canManage && (
        <form className={styles.inviteForm} onSubmit={invite}>
          <label>
            Email
            <input
              onChange={(event) => setEmail(event.target.value)}
              placeholder="operator@company.com"
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Organization role
            <select
              value={organizationRole}
              onChange={(event) => setOrganizationRole(event.target.value)}
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <label>
            Project
            <select
              value={selectedProjectID}
              onChange={(event) => setSelectedProjectID(event.target.value)}
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Project role
            <select
              disabled={!selectedProjectID}
              value={selectedProjectID ? projectRole : "none"}
              onChange={(event) => setProjectRole(event.target.value)}
            >
              <option value="none">No access</option>
              <option value="admin">Admin</option>
              <option value="operator">Operator</option>
              <option value="developer">Developer</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <button className={styles.primary} type="submit">
            Invite member
          </button>
        </form>
      )}

      {acceptURL && (
        <div className={styles.inviteLink}>
          <span>Invitation created</span>
          <input
            readOnly
            value={acceptURL}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(acceptURL)}
          >
            Copy link
          </button>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {projects.length > 0 && (
        <div className={styles.projectToolbar}>
          <div>
            <strong>Project access</strong>
            <small>Choose the project whose roles you want to manage.</small>
          </div>
          <select
            aria-label="Project access"
            value={selectedProjectID}
            onChange={(event) => setSelectedProjectID(event.target.value)}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span>Member</span>
          <span>Organization</span>
          <span>{selectedProject?.name ?? "Project access"}</span>
          <span>Joined</span>
        </div>
        {loading ? (
          <div className={styles.memberRow}>Loading members…</div>
        ) : (
          members.map((member) => (
            <div className={styles.memberRow} key={member.user_id}>
              <span>
                <strong>{member.name || member.email.split("@")[0]}</strong>
                <small>{member.email}</small>
              </span>
              {canManage && member.organization_role !== "owner" ? (
                <select
                  onChange={(event) =>
                    updateOrganizationRole(member, event.target.value)
                  }
                  value={member.organization_role}
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <span className={styles.role}>{member.organization_role}</span>
              )}
              {selectedProject && canManage ? (
                <select
                  disabled={projectLoading}
                  onChange={(event) =>
                    updateProjectRole(member, event.target.value)
                  }
                  value={projectRoles.get(member.user_id) ?? "none"}
                >
                  <option value="none">No access</option>
                  <option value="admin">Admin</option>
                  <option value="operator">Operator</option>
                  <option value="developer">Developer</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <span className={styles.role}>
                  {selectedProject
                    ? (projectRoles.get(member.user_id) ?? "No access")
                    : "No project"}
                </span>
              )}
              <small>{new Date(member.joined_at).toLocaleDateString()}</small>
            </div>
          ))
        )}
      </section>

      {canManage && (
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <strong>Invitations</strong>
            <span>{invitations.length}</span>
          </div>
          {invitations.length === 0 ? (
            <p className={styles.muted}>No invitations have been created.</p>
          ) : (
            invitations.map((invitation) => {
              const status = invitation.accepted_at
                ? "Accepted"
                : invitation.revoked_at
                  ? "Revoked"
                  : new Date(invitation.expires_at) < new Date()
                    ? "Expired"
                    : "Pending";
              return (
                <div className={styles.inviteRow} key={invitation.id}>
                  <span>
                    <strong>{invitation.email}</strong>
                    <small>
                      {invitation.organization_role} · {projectName(invitation.project_id)}
                      {invitation.project_role
                        ? ` · ${invitation.project_role}`
                        : ""}
                    </small>
                  </span>
                  <span className={styles.invitationActions}>
                    <em>{status}</em>
                    {status === "Pending" && (
                      <button
                        type="button"
                        onClick={() => revoke(invitation.id)}
                      >
                        Revoke
                      </button>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </section>
      )}
    </section>
  );
}
