import OrganizationShell from "@/components/organizations/organization-shell";

export default function OrganizationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OrganizationShell>{children}</OrganizationShell>;
}
