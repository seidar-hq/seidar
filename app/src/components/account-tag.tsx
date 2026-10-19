"use client";
import { useState } from "react";
import { shortAddress } from "@/lib/format";
import { useAccountNames, accountName } from "@/lib/account-names";

/* A smart account as the owner named it: the name on top, the C… address
   as small copyable subtext. Unnamed accounts show the short address once. */
export function AccountTag({ address, className }: { address: string; className?: string }) {
  useAccountNames();
  const name = accountName(address);
  const [copied, setCopied] = useState(false);
  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch {
      /* ignore */
    }
  }
  return (
    <span className={`acct-tag${className ? ` ${className}` : ""}`}>
      <b>{name ?? shortAddress(address)}</b>
      <span
        role="button"
        tabIndex={0}
        className="acct-tag-addr"
        title={`Copy ${address}`}
        onClick={copy}
        onKeyDown={(e) => {
          if (e.key === "Enter") void copy(e as unknown as React.MouseEvent);
        }}
      >
        {copied ? "Copied ✓" : name ? shortAddress(address) : "Copy address"}
        {!copied && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        )}
      </span>
    </span>
  );
}
