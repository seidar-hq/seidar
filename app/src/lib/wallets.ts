"use client";

import { isTestnetMode } from "./network";
// Multi-wallet layer on Stellar Wallets Kit (@creit.tech/stellar-wallets-kit).
// One call surface for every wallet: connect, address, network, sign
// transactions, sign messages. WalletConnect + hardware wallets are
// deliberately excluded for now (no signMessage on WalletConnect per kit
// docs; hardware needs USB flows) — the WALLETS list below is the only
// place that changes when they land.
//
// Sign-in compatibility: Freighter is verified SEP-53 end-to-end. The other
// five expose signMessage through the kit; our /auth/verify accepts SEP-53
// framing with a legacy raw-bytes fallback, so either framing verifies.

import { Networks, StellarWalletsKit, SwkAppDarkTheme } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";
import { RabetModule } from "@creit.tech/stellar-wallets-kit/modules/rabet";
import { HanaModule } from "@creit.tech/stellar-wallets-kit/modules/hana";

export type KitWalletId =
  | "freighter"
  | "albedo"
  | "xbull"
  | "lobstr"
  | "rabet"
  | "hana";

export interface WalletMeta {
  id: KitWalletId;
  name: string;
  blurb: string;
  /** Local logo path, or null for a letter badge. */
  logo: string | null;
  /** True once SEP-53 login is verified end-to-end for this wallet. */
  sep53Verified: boolean;
}

export const WALLETS: WalletMeta[] = [
  { id: "freighter", name: "Freighter", blurb: "Browser extension", logo: "/freighter-logo.svg", sep53Verified: true },
  { id: "albedo", name: "Albedo", blurb: "Web wallet", logo: "/albedo-logo.png", sep53Verified: false },
  { id: "xbull", name: "xBull", blurb: "Browser extension", logo: "/xbull-logo.png", sep53Verified: false },
  { id: "lobstr", name: "LOBSTR", blurb: "Extension + mobile", logo: "/lobstr-logo.png", sep53Verified: false },
  { id: "rabet", name: "Rabet", blurb: "Browser extension", logo: "/rabet-logo.png", sep53Verified: false },
  { id: "hana", name: "Hana", blurb: "Browser extension", logo: "/hana-logo.png", sep53Verified: false },
];

const KIND_KEY = "seidar.walletKind";

let ready = false;
function kit() {
  if (typeof window === "undefined") throw new Error("wallets need a browser");
  if (!ready) {
    // NOTE: this default does NOT lock signing to mainnet. Every wallet
    // reports its own network via getNetwork(), and each sign call carries
    // its own networkPassphrase (testnet for Seidar contracts/smart
    // accounts, mainnet for swaps/vaults) — testnet works throughout.
    // Dark theme: the kit's own auth modal renders dark to match the app.
    StellarWalletsKit.init({
      network: isTestnetMode() ? Networks.TESTNET : Networks.PUBLIC,
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

/** Which wallet connected `address` (persisted at connect time). */
export function walletKindFor(address: string | null): KitWalletId | null {
  try {
    if (!address || typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(KIND_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    const id = map[address];
    return WALLETS.some((w) => w.id === id) ? (id as KitWalletId) : null;
  } catch {
    return null;
  }
}

export function rememberWalletKind(address: string, id: KitWalletId): void {
  try {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(KIND_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[address] = id;
    window.localStorage.setItem(KIND_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Connect through the kit's own auth modal (dark): wallet list with
 *  install detection, returns the address plus which wallet was picked
 *  (resolved via the kit's selected module). Null when the user closes
 *  the modal or rejects. */
export async function kitOpenAuthModal(): Promise<{
  address: string;
  walletId: KitWalletId;
} | null> {
  try {
    const k = kit();
    const r = await k.authModal();
    const address = typeof r?.address === "string" ? r.address : "";
    if (!address) return null;
    let walletId: KitWalletId = "freighter";
    try {
      const pid = String(
        (k.selectedModule as { productId?: unknown } | null)?.productId ?? "",
      ).toLowerCase();
      const hit = WALLETS.find((w) => w.id === pid);
      if (hit) walletId = hit.id;
    } catch {
      /* default stands */
    }
    return { address, walletId };
  } catch {
    return null;
  }
}

/** Silent address restore (no prompts). Defaults to Freighter for wallets
    connected before kinds were tracked. */
export async function kitGetAddress(id?: KitWalletId | null): Promise<string | null> {
  try {
    const k = kit();
    k.setWallet(id ?? "freighter");
    const r = await k.getAddress();
    return r?.address ?? null;
  } catch {
    return null;
  }
}

export interface KitNetwork {
  networkPassphrase: string;
  horizonUrl: string;
}

/** Network details with a Horizon URL derived from the passphrase.
 *  `ok: false` means the wallet did not answer (locked/missing) and the
 *  values are mainnet fallbacks — callers must not treat them as the
 *  wallet's real network. */
export async function kitGetNetwork(
  id?: KitWalletId | null,
): Promise<KitNetwork & { network?: string; ok: boolean }> {
  const fallback = {
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    horizonUrl: "https://horizon.stellar.org",
  };
  try {
    const k = kit();
    k.setWallet(id ?? "freighter");
    const n = await k.getNetwork();
    const passphrase =
      typeof n?.networkPassphrase === "string" && n.networkPassphrase
        ? n.networkPassphrase
        : fallback.networkPassphrase;
    const testnet = /test|sandbox|standalone|futurenet/i.test(passphrase);
    return {
      ok: true,
      network: typeof n?.network === "string" ? n.network : undefined,
      networkPassphrase: passphrase,
      horizonUrl: testnet ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org",
    };
  } catch {
    return { ok: false, ...fallback };
  }
}

/** Sign a transaction envelope, always resolving to the signed XDR string. */
export async function kitSignTransaction(
  id: KitWalletId | null,
  xdr: string,
  opts?: { networkPassphrase?: string; address?: string },
): Promise<string> {
  const k = kit();
  k.setWallet(id ?? "freighter");
  const r = (await k.signTransaction(xdr, opts)) as unknown;
  if (typeof r === "string" && r) return r;
  const xdrOut = (r as { signedTxXdr?: unknown } | null)?.signedTxXdr;
  if (typeof xdrOut === "string" && xdrOut) return xdrOut;
  throw new Error("Wallet returned no signed transaction.");
}

export interface KitSignedMessage {
  signedMessage: string | null;
  signerAddress: string;
}

/** Sign an arbitrary message (SEP-53 framing is the wallet's job). */
export async function kitSignMessage(
  id: KitWalletId | null,
  message: string,
  address?: string,
): Promise<KitSignedMessage> {
  const k = kit();
  k.setWallet(id ?? "freighter");
  const r = (await k.signMessage(message, address ? { address } : undefined)) as unknown;
  if (typeof r === "string") return { signedMessage: r, signerAddress: address ?? "" };
  const o = (r ?? {}) as { signedMessage?: unknown; signerAddress?: unknown };
  return {
    signedMessage: typeof o.signedMessage === "string" ? o.signedMessage : null,
    signerAddress: typeof o.signerAddress === "string" ? o.signerAddress : "",
  };
}
