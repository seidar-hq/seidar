"use client";

// Multi-wallet layer on Stellar Wallets Kit: connect, restore, sign. Seidar runs on Stellar
// mainnet only, so every call uses the public network passphrase.

import { Networks, StellarWalletsKit, SwkAppDarkTheme } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";
import { RabetModule } from "@creit.tech/stellar-wallets-kit/modules/rabet";
import { HanaModule } from "@creit.tech/stellar-wallets-kit/modules/hana";

export type KitWalletId = "freighter" | "albedo" | "xbull" | "lobstr" | "rabet" | "hana";

/** "watch" = read-only test wallet: real mainnet data, no signing (dev builds or NEXT_PUBLIC_ENABLE_WATCH=1). */
export type WalletKind = KitWalletId | "watch";

/** bg: the circle behind the logo (brand colour); bleed: the logo is a full square that fills it. */
export type WalletMeta = { id: WalletKind; name: string; logo: string; bg: string; bleed?: boolean };

export const WATCH_ENABLED = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_WATCH === "1";

export const WATCH_META: WalletMeta = { id: "watch", name: "Watch-only", logo: "/assets/defaultWallet.svg", bg: "#2A2A2A" };

export const isStellarAddress = (a: string) => /^G[A-Z2-7]{55}$/.test(a);

export const WALLETS: WalletMeta[] = [
  { id: "freighter", name: "Freighter", logo: "/assets/wallets/freighter-logo.svg", bg: "#5E44E2" },
  { id: "albedo", name: "Albedo", logo: "/assets/wallets/albedo-logo.png", bg: "#FFFFFF" },
  { id: "xbull", name: "xBull", logo: "/assets/wallets/xbull-logo.png", bg: "#202020", bleed: true },
  { id: "lobstr", name: "LOBSTR", logo: "/assets/wallets/lobstr-logo.png", bg: "#51A4BE", bleed: true },
  { id: "rabet", name: "Rabet", logo: "/assets/wallets/rabet-logo.png", bg: "#1B1B2F" },
  { id: "hana", name: "Hana", logo: "/assets/wallets/hana-logo.png", bg: "#16073A", bleed: true },
];

export const STELLAR_LOGO = "/assets/wallets/xlm-logo.png";
export const MAINNET_PASSPHRASE = Networks.PUBLIC;

export const walletMeta = (id: WalletKind | null | undefined): WalletMeta | undefined =>
  id === "watch" ? WATCH_META : WALLETS.find((w) => w.id === id);

let ready = false;
function kit() {
  if (typeof window === "undefined") throw new Error("wallets need a browser");
  if (!ready) {
    StellarWalletsKit.init({
      network: Networks.PUBLIC,
      theme: SwkAppDarkTheme,
      modules: [
        new FreighterModule(),
        new AlbedoModule(),
        new xBullModule(),
        new LobstrModule(),
        new RabetModule(),
        new HanaModule(),
      ],
    });
    ready = true;
  }
  return StellarWalletsKit;
}

/** Connect through the kit's auth modal. Null when the user closes it or rejects. */
export async function kitOpenAuthModal(): Promise<{ address: string; walletId: KitWalletId } | null> {
  try {
    const k = kit();
    const r = await k.authModal();
    const address = typeof r?.address === "string" ? r.address : "";
    if (!address) return null;
    let walletId: KitWalletId = "freighter";
    try {
      const pid = String((k.selectedModule as { productId?: unknown } | null)?.productId ?? "").toLowerCase();
      const hit = WALLETS.find((w) => w.id === pid);
      if (hit) walletId = hit.id as KitWalletId;
    } catch {}
    return { address, walletId };
  } catch {
    return null;
  }
}

/** Silent address read from a wallet (no prompt). */
export async function kitGetAddress(id: KitWalletId): Promise<string | null> {
  try {
    const k = kit();
    k.setWallet(id);
    const r = await k.getAddress();
    return r?.address ?? null;
  } catch {
    return null;
  }
}

/** Thrown when a watch-only wallet is asked to sign; carries the built XDR for inspection. */
export class WatchOnlyError extends Error {
  constructor(public xdr: string) {
    super("Watch-only wallet: the transaction was built but cannot be signed.");
  }
}

/** Sign a transaction envelope on mainnet, resolving to the signed XDR. */
export async function kitSignTransaction(id: WalletKind, xdr: string, address?: string): Promise<string> {
  if (id === "watch") throw new WatchOnlyError(xdr);
  const k = kit();
  k.setWallet(id);
  const r = (await k.signTransaction(xdr, { networkPassphrase: Networks.PUBLIC, address })) as unknown;
  if (typeof r === "string" && r) return r;
  const out = (r as { signedTxXdr?: unknown } | null)?.signedTxXdr;
  if (typeof out === "string" && out) return out;
  throw new Error("Wallet returned no signed transaction.");
}

export async function kitDisconnect(): Promise<void> {
  try {
    await kit().disconnect();
  } catch {}
}
