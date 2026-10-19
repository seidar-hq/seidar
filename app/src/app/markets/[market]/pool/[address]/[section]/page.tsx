import { notFound } from "next/navigation";
import { PoolDetail, type VenueSection } from "@/components/views";

const PROTOCOLS = ["aqua", "phoenix", "soroswap", "sushi"] as const;
type DexProtocolId = (typeof PROTOCOLS)[number];
const isDex = (v: string): v is DexProtocolId => (PROTOCOLS as readonly string[]).includes(v);
const isContract = (v: string) => /^C[A-Z2-7]{55}$/.test(v);
const SECTIONS: VenueSection[] = ["history", "automate"];

export default async function PoolSectionPage({
  params,
}: {
  params: Promise<{ market: string; address: string; section: string }>;
}) {
  const { market: protocol, address, section } = await params;
  if (!isDex(protocol) || !isContract(address) || !SECTIONS.includes(section as VenueSection)) notFound();
  // Pool automations exist for Aqua pools only.
  if (section === "automate" && protocol !== "aqua") notFound();
  return <PoolDetail protocol={protocol} address={address} section={section as VenueSection} />;
}
