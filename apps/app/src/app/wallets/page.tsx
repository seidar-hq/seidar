"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Wallet management lives in Settings → Wallet.
export default function Page() {
  const router = useRouter();
  useEffect(() => router.replace("/settings"), [router]);
  return null;
}
