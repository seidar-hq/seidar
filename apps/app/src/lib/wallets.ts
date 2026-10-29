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
// MetaMask's own Stellar adapter (@metamask/connect-stellar, SEP-43 over the MetaMask Multichain API).
import { MetaMaskModule } from "@creit.tech/stellar-wallets-kit/modules/metamask";

export type KitWalletId = "freighter" | "metamask" | "albedo" | "xbull" | "lobstr" | "rabet" | "hana" | "wallet_connect";

/** "watch" = read-only test wallet: real mainnet data, no signing (dev builds or NEXT_PUBLIC_ENABLE_WATCH=1). */
export type WalletKind = KitWalletId | "watch";

/** bg: the circle behind the logo (brand colour); bleed: the logo is a full square that fills it. */
export type WalletMeta = { id: WalletKind; name: string; logo: string; bg: string; bleed?: boolean };

export const WATCH_ENABLED = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_WATCH === "1";

export const WATCH_META: WalletMeta = { id: "watch", name: "Watch-only", logo: "/assets/defaultWallet.svg", bg: "#2A2A2A" };

export const isStellarAddress = (a: string) => /^G[A-Z2-7]{55}$/.test(a);

export const WALLETS: WalletMeta[] = [
  // Freighter was renamed Varial (Oct 2026). Its extension API is unchanged, so the kit's Freighter
  // module and the stored "freighter" id still work; only the name and logo shown are new.
  { id: "freighter", name: "Varial", logo: "/assets/wallets/varial-logo.png", bg: "#1F3CFF", bleed: true },
  // Stellar is a default network in MetaMask since Oct 29 2026 (extension 13.54+, mobile 8.17+).
  { id: "metamask", name: "MetaMask", logo: "/assets/wallets/metamask-logo.svg", bg: "#FFFFFF", bleed: true },
  { id: "albedo", name: "Albedo", logo: "/assets/wallets/albedo-logo.png", bg: "#FFFFFF" },
  { id: "xbull", name: "xBull", logo: "/assets/wallets/xbull-logo.png", bg: "#202020", bleed: true },
  { id: "lobstr", name: "LOBSTR", logo: "/assets/wallets/lobstr-logo.png", bg: "#51A4BE", bleed: true },
  { id: "rabet", name: "Rabet", logo: "/assets/wallets/rabet-logo.png", bg: "#1B1B2F" },
  { id: "hana", name: "Hana", logo: "/assets/wallets/hana-logo.png", bg: "#16073A", bleed: true },
  { id: "wallet_connect", name: "WalletConnect", logo: "/assets/wallets/walletconnect-logo.png", bg: "#3B99FC", bleed: true },
];

// WalletConnect (Reown) project id. Without it the WalletConnect option is left out of the modal.
// It is how phones connect: Varial / LOBSTR mobile pair over WalletConnect, and inside
// Varial mobile's own browser the kit connects through it without showing the modal.
const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.seidar.xyz";

export const STELLAR_LOGO = "/assets/wallets/xlm-logo.png";
export const MAINNET_PASSPHRASE = Networks.PUBLIC;

export const walletMeta = (id: WalletKind | null | undefined): WalletMeta | undefined =>
  id === "watch" ? WATCH_META : WALLETS.find((w) => w.id === id);

/** The wallet app on the other end of a WalletConnect session (e.g. Varial or LOBSTR mobile). */
export type WalletPeer = { name: string; icon?: string };

/** What to show for a linked wallet: over WalletConnect, the wallet app that answered, not WalletConnect itself. */
export function displayMeta(id: WalletKind | null | undefined, peer?: WalletPeer | null): WalletMeta | undefined {
  const base = walletMeta(id);
  if (id !== "wallet_connect" || !peer?.name) return base;
  // Older Varial mobile builds still call themselves Freighter.
  const name = peer.name.toLowerCase().replace("freighter", "varial");
  const known = WALLETS.find((w) => w.id !== "wallet_connect" && name.includes(w.name.toLowerCase()));
  if (known) return { ...known, id: "wallet_connect" };
  return peer.icon ? { id: "wallet_connect", name: peer.name, logo: peer.icon, bg: "#FFFFFF", bleed: true } : { ...base!, name: peer.name };
}

type WcSession = { topic: string; peer?: { metadata?: { name?: string; icons?: string[] } }; namespaces: { stellar?: { accounts: string[] } } };

const peerOf = (s: WcSession | null | undefined): WalletPeer | null => {
  const m = s?.peer?.metadata;
  if (!m?.name) return null;
  const icon = m.icons?.find((u) => /^https:\/\//.test(u));
  return icon ? { name: m.name, icon } : { name: m.name };
};

let wcInstance: { getSessions(): Promise<WcSession[]>; lastPeer: WalletPeer | null } | null = null;

/** The WalletConnect module is large (Reown AppKit), so it loads only when the kit first starts. */
async function walletConnectModule() {
  if (!WC_PROJECT_ID) return [];
  try {
    const { WalletConnectModule, WalletConnectTargetChain, WalletConnectAllowedMethods: M } = await import(
      "@creit.tech/stellar-wallets-kit/modules/wallet-connect"
    );
    const { wcSessionPaths } = await import("@creit.tech/stellar-wallets-kit/state");
    type Proposal = Awaited<ReturnType<InstanceType<typeof WalletConnectModule>["signClient"]["connect"]>> & { at: number };
    const chains = [WalletConnectTargetChain.PUBLIC];

    // Creating a pairing takes several seconds of relay round trips, and the kit showed nothing while
    // it ran (so people tapped again and again). Keep one pairing ready so a tap opens the wallet
    // picker at once. Proposals expire after 5 minutes; an older one is replaced on use.
    class PreparedWalletConnect extends WalletConnectModule {
      private next: Promise<Proposal> | null = null;
      lastPeer: WalletPeer | null = null;

      private propose(): Promise<Proposal> {
        return this.signClient
          .connect({
            requiredNamespaces: { stellar: { methods: [M.SIGN], chains, events: [] } },
            optionalNamespaces: { stellar: { methods: [M.SIGN_AND_SUBMIT, M.SIGN_AUTH_ENTRY, M.SIGN_MESSAGE], chains, events: [] } },
          })
          .then((p) => ({ ...p, at: Date.now() }));
      }

      prepare(): void {
        if (this.next || !this.signClient) return;
        const p = this.propose();
        this.next = p;
        p.catch(() => {
          if (this.next === p) this.next = null;
        });
      }

      private async take(): Promise<Proposal> {
        const p = this.next;
        this.next = null;
        const ready = p ? await p.catch(() => null) : null;
        return ready && Date.now() - ready.at < 4 * 60_000 ? ready : this.propose();
      }

      override async getAddress() {
        await this.runChecks();
        const { uri, approval } = await this.take();
        if (uri) this.modal.open({ uri });
        // Closing the modal ends the attempt; otherwise the kit would wait on approval() forever.
        let unsubscribe = () => {};
        const closed = new Promise<never>((_, reject) => {
          let shown = false;
          unsubscribe = this.modal.subscribeState((st) => {
            if (st.open) shown = true;
            else if (shown) reject(new Error("WalletConnect was closed."));
          });
        });
        closed.catch(() => {});
        try {
          const session = await Promise.race([approval(), closed]);
          this.lastPeer = peerOf(session as WcSession);
          const accounts = session.namespaces.stellar.accounts.map((a) => a.split(":")[2]);
          wcSessionPaths.value = [...wcSessionPaths.value, ...accounts.map((publicKey) => ({ publicKey, topic: session.topic }))];
          return { address: accounts[0] };
        } finally {
          unsubscribe();
          this.modal.close();
          this.prepare();
        }
      }
    }

    const wc = new PreparedWalletConnect({
      projectId: WC_PROJECT_ID,
      metadata: {
        name: "Seidar",
        description: "Stellar DeFi, all in one place",
        url: typeof window !== "undefined" ? window.location.origin : APP_URL,
        icons: [`${APP_URL}/assets/seidar-icon-256.png`],
      },
      allowedChains: chains,
    });
    // Its sign client starts asynchronously. The kit checks availability when the modal opens, so a
    // module that isn't ready yet would be listed as "Install"; wait for it (bounded) first.
    for (let i = 0; i < 40 && !(await wc.isAvailable()); i++) await new Promise((r) => setTimeout(r, 200));
    wc.prepare();
    wcInstance = wc as unknown as typeof wcInstance;
    return [wc];
  } catch {
    return [];
  }
}

const isPhone = () =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) && window.matchMedia("(pointer: coarse)").matches;

/** True when the wallet answers within `ms` (some extension probes never settle when absent). */
const availableWithin = (m: { isAvailable(): Promise<boolean> }, ms = 800) =>
  Promise.race([m.isAvailable().catch(() => false), new Promise<boolean>((r) => setTimeout(() => r(false), ms))]);

let starting: Promise<typeof StellarWalletsKit> | null = null;
function kit(): Promise<typeof StellarWalletsKit> {
  if (typeof window === "undefined") return Promise.reject(new Error("wallets need a browser"));
  starting ??= (async () => {
    // Browser-extension wallets. On a phone there are no extensions, so they only appear when the
    // page is open inside that wallet's own in-app browser (which injects the same API).
    const varial = Object.assign(new FreighterModule(), {
      productName: "Varial",
      productUrl: "https://varialwallet.com",
      productIcon: `${window.location.origin}/assets/wallets/varial-logo.png`,
    });
    const injected = [varial, new MetaMaskModule(), new LobstrModule(), new RabetModule(), new HanaModule()];
    const phone = isPhone();
    const [wc, present] = await Promise.all([
      walletConnectModule(),
      phone ? Promise.all(injected.map((m) => availableWithin(m))) : Promise.resolve(injected.map(() => true)),
    ]);
    const [freighter, metamask, lobstr, rabet, hana] = injected.map((m, i) => (present[i] ? [m] : []));
    // Web wallets (xBull, Albedo) work in any browser, desktop or mobile. Phones list WalletConnect first.
    const modules = phone
      ? [...wc, ...freighter, ...metamask, ...lobstr, ...hana, ...rabet, new xBullModule(), new AlbedoModule()]
      : [...freighter, ...metamask, new AlbedoModule(), new xBullModule(), ...lobstr, ...rabet, ...hana, ...wc];
    StellarWalletsKit.init({ network: Networks.PUBLIC, theme: SwkAppDarkTheme, modules });
    return StellarWalletsKit;
  })();
  return starting;
}

/** Start the kit in the background (after page load) so the connect modal opens instantly. */
export function warmWallets(): void {
  void kit().catch(() => {});
}

/** Connect through the kit's auth modal. Null when the user closes it or rejects. */
export async function kitOpenAuthModal(): Promise<{ address: string; walletId: KitWalletId; peer?: WalletPeer } | null> {
  try {
    const k = await kit();
    const r = await k.authModal();
    const address = typeof r?.address === "string" ? r.address : "";
    if (!address) return null;
    let walletId: KitWalletId = "freighter";
    try {
      const pid = String((k.selectedModule as { productId?: unknown } | null)?.productId ?? "").toLowerCase();
      const hit = WALLETS.find((w) => w.id === pid);
      if (hit) walletId = hit.id as KitWalletId;
    } catch {}
    const peer = walletId === "wallet_connect" ? wcInstance?.lastPeer : null;
    return peer ? { address, walletId, peer } : { address, walletId };
  } catch {
    return null;
  }
}

/** The wallet app behind each address with a live WalletConnect session (for wallets linked before peers were saved). */
export async function kitWalletConnectPeers(): Promise<Record<string, WalletPeer>> {
  const out: Record<string, WalletPeer> = {};
  try {
    await kit();
    for (const s of (await wcInstance?.getSessions()) ?? []) {
      const peer = peerOf(s);
      if (peer) for (const a of s.namespaces.stellar?.accounts ?? []) out[a.split(":")[2]] = peer;
    }
  } catch {}
  return out;
}

/** Silent address read from a wallet (no prompt). */
export async function kitGetAddress(id: KitWalletId): Promise<string | null> {
  try {
    const k = await kit();
    k.setWallet(id);
    const r = await k.getAddress();
    return r?.address ?? null;
  } catch {
    return null;
  }
}

/** WalletConnect's sign client starts asynchronously; after a reload give it a few seconds before signing. */
async function walletConnectReady(k: typeof StellarWalletsKit) {
  const mod = k.selectedModule as { isAvailable(): Promise<boolean> } | null;
  for (let i = 0; i < 40 && mod && !(await mod.isAvailable()); i++) await new Promise((r) => setTimeout(r, 250));
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
  const k = await kit();
  k.setWallet(id);
  if (id === "wallet_connect") await walletConnectReady(k);
  const r = (await k.signTransaction(xdr, { networkPassphrase: Networks.PUBLIC, address })) as unknown;
  if (typeof r === "string" && r) return r;
  const out = (r as { signedTxXdr?: unknown } | null)?.signedTxXdr;
  if (typeof out === "string" && out) return out;
  throw new Error("Wallet returned no signed transaction.");
}

export async function kitDisconnect(): Promise<void> {
  try {
    await (await kit()).disconnect();
  } catch {}
}
