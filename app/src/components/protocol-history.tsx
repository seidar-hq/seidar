"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { explorerTx } from "@/lib/tx";

/* Protocol History tab: the account's own transactions with this
   protocol's contracts (decoded from Horizon), newest first. */

type Item = { at: string; action: string; detail: string; hash: string; ok: boolean };

export function ProtocolHistory({
  protocol,
  address,
  owner,
  contract,
}: {
  protocol: string;
  address: string | null;
  /** One vault or pool (venue protocols); lending reads the whole protocol. */
  contract?: string;
  /** Wallet that signs for a smart account (its history lives there). */
  owner: string | null;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setItems([]);
      return;
    }
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setItems(null);
    setErr(null);
    const load = () =>
      apiFetch(`/api/history?address=${address}&owner=${owner ?? ""}&protocol=${protocol}${contract ? `&contract=${contract}` : ""}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (dead) return;
          if (d?.ok) {
            setItems(d.items ?? []);
            setErr(null);
          } else {
            setErr(d?.error ?? "History is unavailable right now — retrying shortly.");
            timer = setTimeout(load, 15_000);
          }
        })
        .catch(() => {
          if (dead) return;
          setErr("History is unavailable right now — retrying shortly.");
          timer = setTimeout(load, 15_000);
        });
    load();
    window.addEventListener("seidar:refresh", load);
    return () => {
      dead = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("seidar:refresh", load);
    };
  }, [protocol, address, owner, contract]);

  if (!address) return <p className="ph-empty">Connect a wallet to see your history.</p>;
  if (err) return <p className="ph-empty">{err}</p>;
  if (items == null) return <p className="ph-empty">Loading your transactions…</p>;
  if (items.length === 0) return <p className="ph-empty">No transactions with this protocol from this account yet.</p>;

  return (
    <div className="ph">
      <div className="ph-head">
        <span>Action</span>
        <span>Date</span>
        <span>Status</span>
        <span />
      </div>
      {items.map((it) => (
        <div key={it.hash + it.at} className="ph-row">
          <b>{it.action}</b>
          <span>{new Date(it.at).toLocaleString()}</span>
          <span className={it.ok ? "ph-ok" : "ph-bad"}>{it.ok ? "Confirmed" : "Failed"}</span>
          <a href={explorerTx(it.hash)} target="_blank" rel="noreferrer">
            View tx
          </a>
        </div>
      ))}
    </div>
  );
}
