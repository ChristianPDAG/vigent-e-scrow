"use client";

import {
  ConnectionProvider,
  useWallet,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider, useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { useCallback, useEffect, useMemo } from "react";
import { SOLANA_RPC_URL } from "@/lib/constants";

import "@solana/wallet-adapter-react-ui/styles.css";

function WalletDebugLogger() {
  const { wallets, wallet, publicKey, connecting, connected, disconnecting } = useWallet();
  const { visible } = useWalletModal();

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const browserWindow = window as Window & {
      phantom?: { solana?: { isPhantom?: boolean } };
    };

    console.log("[wallet-debug] wallet state", {
      modalVisible: visible,
      selectedWallet: wallet?.adapter.name ?? null,
      selectedReadyState: wallet?.adapter.readyState ?? null,
      publicKey: publicKey?.toBase58() ?? null,
      connecting,
      connected,
      disconnecting,
      adapters: wallets.map(({ adapter }) => ({
        name: adapter.name,
        readyState: adapter.readyState,
      })),
      phantomProviderDetected: Boolean(browserWindow.phantom?.solana?.isPhantom),
    });
  }, [connected, connecting, disconnecting, publicKey, visible, wallet, wallets]);

  return null;
}

export function SolanaProviderInner({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  const handleWalletError = useCallback((error: unknown) => {
    if (process.env.NODE_ENV !== "development") return;

    console.error("[wallet-debug] wallet adapter error", error);
  }, []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect onError={handleWalletError}>
        <WalletModalProvider>
          <WalletDebugLogger />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
