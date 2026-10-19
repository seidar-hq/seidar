import { notFound } from "next/navigation";
import { PoolDetail } from "@/components/views";

const PROTOCOLS = ["aqua", "phoenix", "soroswap", "sushi"] as const;
type DexProtocolId = (typeof PROTOCOLS)[number];
const isDex = (v: string): v is DexProtocolId => (PROTOCOLS as readonly string[]).includes(v);
const isContract = (v: string) => /^C[A-Z2-7]{55}$/.test(v);

export default async function PoolDetailPage({
  params,
}: {
  params: Promise<{ market: string; address: string }>;
}) {
  const { market: protocol, address } = await params;
  if (!isDex(protocol) || !isContract(address)) notFound();
  return <PoolDetail protocol={protocol} address={address} />;
}
