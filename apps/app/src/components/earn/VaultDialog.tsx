"use client";

import { formatAmount } from "@/lib/format";
import { toBase } from "@/lib/tx";
import { usePortfolio, useTokenCatalogue } from "@/portfolio/usePortfolio";
import { useBalances } from "@/wallet/useBalances";
import { useWallet } from "@/wallet/WalletContext";
import ActionDialog from "./ActionDialog";
import { VAULT_PROTOCOLS, apyText, type VaultListRow } from "./Vaults";

/** Deposit into / withdraw from a vault (DeFindex, Upshift or Sentora), built by the API. */
export default function VaultDialog({ vault, initial, onClose }: { vault: VaultListRow; initial: "deposit" | "withdraw"; onClose: () => void }) {
  const { activeWallet } = useWallet();
  const { byContract } = useTokenCatalogue();
  const portfolio = usePortfolio();
  const { byAddress } = useBalances(activeWallet ? [activeWallet.address] : []);
  const issuer = byContract.get(vault.asset)?.issuer ?? null;
  const held = activeWallet ? byAddress[activeWallet.address]?.tokens.find((t) => t.code === vault.assetCode && (t.issuer ?? null) === issuer) : undefined;
  const mine = portfolio.vaults.find((v) => v.vault === vault.address && v.wallet === activeWallet?.address);
  const deposited = mine?.underlying[0]?.amount ?? 0;
  const name = VAULT_PROTOCOLS[vault.protocol] ?? vault.protocol;

  const body = (action: "deposit" | "withdraw", amount: string) => {
    const base = { protocol: vault.protocol, vault: vault.address, caller: activeWallet!.address, slippageBps: 50 };
    if (action === "withdraw" && amount === "max")
      return vault.protocol === "sentora"
        ? { ...base, action: "withdraw", shares: "max" }
        : { ...base, action: "withdraw-shares", shares: mine?.shares ?? "0" };
    return { ...base, action, amounts: [toBase(amount, vault.assetDecimals) ?? "0"] };
  };

  return (
    <ActionDialog
      open
      onClose={onClose}
      title={`${vault.name} · ${name}`}
      token={{ code: vault.assetCode, issuer }}
      price={held?.price ?? null}
      initial={initial}
      actions={[
        {
          id: "deposit",
          label: "Deposit",
          available: held?.amount ?? 0,
          availableLabel: "Wallet balance",
          disabledReason: vault.paused ? "VAULT PAUSED" : null,
          details: [
            { label: "APY", value: apyText(vault) },
            { label: "Withdrawals", value: vault.withdrawalDays ? `${vault.withdrawalDays} day queue` : "Instant" },
          ],
          build: (amount) => ({ path: "/api/vaults/build", body: body("deposit", amount), label: `Deposit ${amount} ${vault.assetCode} into ${vault.name}` }),
        },
        {
          id: "withdraw",
          label: "Withdraw",
          available: deposited,
          availableLabel: "Deposited",
          allowMax: true,
          details: [{ label: "Your deposit", value: `${formatAmount(deposited, 6)} ${vault.assetCode}` }],
          build: (amount) => ({
            path: "/api/vaults/build",
            body: body("withdraw", amount),
            label: `Withdraw ${amount === "max" ? "all" : amount} ${vault.assetCode} from ${vault.name}`,
          }),
        },
      ]}
    />
  );
}
