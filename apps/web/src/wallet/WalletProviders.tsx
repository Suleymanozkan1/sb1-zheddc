// Solana wallet-adapter setup. Phantom, Solflare and Backpack implement the Wallet Standard,
// so they are detected automatically without bundling per-wallet adapter packages.
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { useMemo, type ReactNode } from "react";

const NETWORK = ((import.meta.env.VITE_SOLANA_NETWORK as string | undefined) ?? "devnet") as WalletAdapterNetwork;

export function WalletProviders({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) || clusterApiUrl(NETWORK === "mainnet-beta" ? "mainnet-beta" : NETWORK), []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect={false}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export const RECOMMENDED_WALLETS = ["Phantom", "Solflare", "Backpack"] as const;
