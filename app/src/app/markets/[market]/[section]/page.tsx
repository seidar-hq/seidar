import { notFound } from "next/navigation";
import { Views } from "@/components/views";
import type { AppView } from "@/components/shell";
import type { ProtocolSection } from "@/components/views";

const PROTOCOL_VIEWS: Record<string, AppView> = {
  blend: "blend",
  xoxno: "xoxno",
};

const SECTIONS: Record<string, ProtocolSection> = {
  manage: "manage",
  automate: "automate",
  notify: "notify",
  history: "history",
  create: "create",
  lend: "lend",
};

export default async function ProtocolSectionPage({
  params,
}: {
  params: Promise<{ market: string; section: string }>;
}) {
  const { market: protocol, section } = await params;
  const view = PROTOCOL_VIEWS[protocol];
  const tab = SECTIONS[section];
  if (!view || !tab) notFound();
  return <Views view={view} section={tab} />;
}
