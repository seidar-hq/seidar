import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Workspace | Seidar",
  description: "Operate confidential assets on Stellar with Seidar.",
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
