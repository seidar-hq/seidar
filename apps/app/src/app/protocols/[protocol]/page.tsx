import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Views } from "@/components/views";
import type { AppView } from "@/components/shell";

const PROTOCOL_VIEWS: Record<string, AppView> = {
  blend: "blend",
  xoxno: "xoxno",
  peridot: "peridot",
};

export default async function ProtocolPage({
  params,
}: {
  params: Promise<{ protocol: string }>;
}) {
  const { protocol } = await params;
  const view = PROTOCOL_VIEWS[protocol];
  if (!view) notFound();
  return (
    <Shell>
      <Views view={view} />
    </Shell>
  );
}
