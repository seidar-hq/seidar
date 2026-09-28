import DashboardShell from "@/components/dashboard/dashboard-shell";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
