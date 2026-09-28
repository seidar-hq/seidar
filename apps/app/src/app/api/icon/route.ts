import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://w3s.link/ipfs/",
];

// In-memory icon cache (per server instance). Browser caches via headers.
const cache = new Map<string, { bytes: ArrayBuffer; type: string; at: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Consistent icon fetch: CID in, image bytes out. Server-side gateway
 * failover (browsers often can't reach public IPFS gateways directly),
 * same-origin response (no CORS/CSP issues for any client).
 */
export async function GET(req: Request) {
  const cid = new URL(req.url).searchParams.get("cid") ?? "";
  if (!/^[A-Za-z0-9]{10,100}$/.test(cid)) {
    return NextResponse.json({ error: "invalid cid" }, { status: 400 });
  }
  const hit = cache.get(cid);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return new NextResponse(hit.bytes, {
      headers: {
        "Content-Type": hit.type,
        "Cache-Control": "public, max-age=86400",
      },
    });
  }
  for (const g of GATEWAYS) {
    try {
      const r = await fetchWithTimeout(`${g}${cid}`, 12000);
      if (!r.ok) continue;
      const type = r.headers.get("content-type") ?? "image/png";
      if (!type.startsWith("image/")) continue;
      const bytes = await r.arrayBuffer();
      if (bytes.byteLength < 200) continue;
      cache.set(cid, { bytes, type, at: Date.now() });
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": type,
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      /* next gateway */
    }
  }
  return NextResponse.json({ error: "unavailable" }, { status: 502 });
}
