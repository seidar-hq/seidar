import { redirect } from "next/navigation";

// No main markets page: the sidebar Markets entry is a dropdown menu,
// so a bare /markets visit lands on the first market.
export default function MarketsPage() {
  redirect("/markets/blend");
}
