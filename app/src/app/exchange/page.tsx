import { redirect } from "next/navigation";

// Each Exchange mode has its own path; bare /exchange lands on Swap.
export default function ExchangePage() {
  redirect("/exchange/swap");
}
