import { notFound } from "next/navigation";
import { Views } from "@/components/views";
import type { AppView } from "@/components/shell";

const PROTOCOL_VIEWS: Record<string, AppView> = {
  blend: "blend",
  xoxno: "xoxno",
  defindex: "defindex",
  upshift: "upshift",
  soroswap: "soroswap",
  phoenix: "phoenix",
  aqua: "aqua",
  sushi: "sushi",
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
