import { NextResponse } from "next/server";
import { fetchActivity } from "@/lib/chain";

export const dynamic = "force-dynamic";

/** Live testnet activity for Seidar contracts (server-side: no CORS issues). */
export async function GET() {
  try {
    const data = await fetchActivity();
    return NextResponse.json({ live: true, ...data });
  } catch (e) {
    return NextResponse.json(
      { live: false, ledger: 0, events: [], error: String((e as Error).message || e) },
      { status: 200 }
    );
  }
}
