import type { Adjustments } from "@/admin/adjustments";
import type { Summary } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002").replace(/\/$/, "");
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.seidar.xyz";
export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.seidar.xyz";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://seidar.xyz";

export async function fetchSummary(): Promise<Summary> {
  const r = await fetch(`${API_URL}/analytics/summary`, { cache: "no-store" });
  const j = (await r.json().catch(() => null)) as ({ ok?: boolean; error?: string } & Partial<Summary>) | null;
  if (!j?.ok) throw new Error(j?.error === "db-unavailable" ? "Analytics database unavailable." : "Analytics are unavailable right now.");
  return j as Summary;
}

export type AdminAdjustmentsResult =
  | { ok: true; adjustments: Adjustments; updatedAt: string | null }
  | { ok: false; error: string };

const adminError = (status: number, j: { error?: string } | null): string => {
  if (status === 401) return "That admin token is not valid.";
  if (j?.error === "db-unavailable") return "Analytics database unavailable.";
  return j?.error ?? "Admin request failed.";
};

export async function fetchAdjustments(token: string): Promise<AdminAdjustmentsResult> {
  try {
    const r = await fetch(`${API_URL}/analytics/admin/adjustments`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` },
    });
    const j = (await r.json().catch(() => null)) as ({ ok?: boolean; error?: string; adjustments?: Adjustments; updatedAt?: string | null }) | null;
    if (!r.ok || !j?.ok || !j?.adjustments) return { ok: false, error: adminError(r.status, j) };
    return { ok: true, adjustments: j.adjustments, updatedAt: j.updatedAt ?? null };
  } catch {
    return { ok: false, error: "Could not reach the analytics API." };
  }
}

export async function saveAdjustments(token: string, adjustments: Adjustments): Promise<AdminAdjustmentsResult> {
  try {
    const r = await fetch(`${API_URL}/analytics/admin/adjustments`, {
      method: "PUT",
      cache: "no-store",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(adjustments),
    });
    const j = (await r.json().catch(() => null)) as ({ ok?: boolean; error?: string; adjustments?: Adjustments; updatedAt?: string | null }) | null;
    if (!r.ok || !j?.ok || !j?.adjustments) return { ok: false, error: adminError(r.status, j) };
    return { ok: true, adjustments: j.adjustments, updatedAt: j.updatedAt ?? null };
  } catch {
    return { ok: false, error: "Could not reach the analytics API." };
  }
}

export const explorerTx = (hash: string) => `https://stellar.expert/explorer/public/tx/${hash}`;
