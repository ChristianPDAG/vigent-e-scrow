"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { truncateAddress, formatAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Wallet, ChevronDown, LogOut } from "lucide-react";
import { useState } from "react";

export function WalletButton() {
  const { publicKey, disconnect } = useWallet();
  const { setVisible, visible } = useWalletModal();
  const balance = useWalletBalance();
  const [showMenu, setShowMenu] = useState(false);

  const handleConnectClick = () => {
    if (process.env.NODE_ENV === "development") {
      console.log("[wallet-debug] header Connect Wallet clicked", {
        modalVisibleBeforeClick: visible,
        publicKey: publicKey?.toBase58() ?? null,
      });
    }

    setVisible(true);
  };

  if (!publicKey) {
    return (
      <Button onClick={handleConnectClick} size="sm">
        <Wallet className="h-4 w-4" />
        Connect Wallet
      </Button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-sm hover:border-primary/50 transition-colors"
      >
        <div className="h-2 w-2 rounded-full bg-success" />
        <span className="font-mono text-text-main">
          {truncateAddress(publicKey.toBase58())}
        </span>
        {balance !== null && (
          <span className="text-text-muted">{formatAmount(balance, 3)} SOL</span>
        )}
        <ChevronDown className="h-3 w-3 text-text-muted" />
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-lg border border-border bg-bg-card shadow-xl">
            <button
              onClick={() => { disconnect(); setShowMenu(false); }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-danger hover:bg-bg-elevated rounded-lg transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
