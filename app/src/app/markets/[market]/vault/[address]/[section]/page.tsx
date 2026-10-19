import { notFound } from "next/navigation";
import { VaultDetail } from "@/components/vault-detail";

const isVaultVenue = (v: string) => v === "defindex" || v === "upshift";
const isContract = (v: string) => /^C[A-Z2-7]{55}$/.test(v);

export default async function VaultSectionPage({
  params,
}: {
  params: Promise<{ market: string; address: string; section: string }>;
}) {
  const { market, address, section } = await params;
  if (!isVaultVenue(market) || !isContract(address) || section !== "history") notFound();
  return <VaultDetail protocol={market} address={address} section="history" />;
}
