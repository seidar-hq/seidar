// @seidar/indexer — Soroban event normalizer -> portfolio/history rows.
// Consumes RPC `getEvents` pages for recipe/guardian contracts and reduces
// them into dashboard state. Postgres persistence in production; pure
// reduce logic here (battle-tested).

import { aggregatePortfolio } from "@seidar/positions-sdk";

/** Normalize one raw contract event into a row (null = ignore). */
export function normalizeEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const { contract, topic, data, ledger } = raw;
  if (topic === "recipe" || topic === "action" || topic === "fired" || topic === "rule") {
    return { contract, topic, data: data ?? null, ledger: ledger ?? 0 };
  }
  return null;
}

/** Reduce normalized rows into per-owner activity + position hints. */
export function reduceActivity(rows) {
  const byOwner = new Map();
  for (const r of rows) {
    if (!r || !r.data || typeof r.data.owner !== "string") continue;
    if (!byOwner.has(r.data.owner)) byOwner.set(r.data.owner, []);
    byOwner.get(r.data.owner).push({ topic: r.topic, ledger: r.ledger, ref: r.data.ref ?? null });
  }
  return byOwner;
}

export { aggregatePortfolio };
