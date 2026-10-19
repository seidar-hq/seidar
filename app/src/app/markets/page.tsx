import { redirect } from "next/navigation";

// Markets are retirement: Seidar works with vaults + RWA only, so a bare
// /markets visit lands on the vaults hub.
export default function MarketsPage() {
  redirect("/vaults");
}
