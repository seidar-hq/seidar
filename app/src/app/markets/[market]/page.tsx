import { notFound } from "next/navigation";
import { Views } from "@/components/views";
import type { AppView } from "@/components/shell";

const PROTOCOL_VIEWS: Record<string, AppView> = {
  // Vaults + RWA only: the venue pages that survive are the vault
  // browsers. Lending (blend/xoxno) and pool (dex) pages are retired.
  defindex: "defindex",
  upshift: "upshift",
};

export default async function ProtocolPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: protocol } = await params;
  const view = PROTOCOL_VIEWS[protocol];
  if (!view) notFound();
  return <Views view={view} />;
}
