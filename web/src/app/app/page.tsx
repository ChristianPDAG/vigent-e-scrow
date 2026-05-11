"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { useEscrow } from "@/hooks/use-escrow";
import { EscrowCard } from "@/components/escrow/escrow-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Wallet, Plus, Inbox } from "lucide-react";
import type { EscrowFilters } from "@/types/escrow";

type Tab = "all" | "depositor" | "receiver";

export default function DashboardPage() {
  const { publicKey } = useWallet();
  const { setVisible, visible } = useWalletModal();
  const { escrows, isLoading, fetchEscrows } = useEscrow();
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    if (!publicKey) return;
    const filters: EscrowFilters = tab === "all" ? {} : { role: tab };
    fetchEscrows(filters);
  }, [publicKey, tab, fetchEscrows]);

  if (!publicKey) {
    const handleConnectClick = () => {
      if (process.env.NODE_ENV === "development") {
        console.log("[wallet-debug] dashboard Connect Wallet clicked", {
          modalVisibleBeforeClick: visible,
          publicKey: null,
        });
      }

      setVisible(true);
    };

    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
          <Wallet className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-text-main">Connect your wallet</h2>
        <p className="text-text-muted text-center max-w-xs">
          Connect a Solana wallet to see your escrows and create new ones.
        </p>
        <Button onClick={handleConnectClick}>
          <Wallet className="h-4 w-4" />
          Connect Wallet
        </Button>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "depositor", label: "As Depositor" },
    { id: "receiver", label: "As Receiver" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-main">My Escrows</h1>
          <p className="text-text-muted text-sm mt-1">Manage your presential escrow transactions</p>
        </div>
        <Link href="/app/create">
          <Button>
            <Plus className="h-4 w-4" />
            New Escrow
          </Button>
        </Link>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-text-secondary"
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : escrows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Inbox className="h-12 w-12 text-text-muted" />
          <p className="text-text-secondary font-medium">No escrows yet</p>
          <p className="text-text-muted text-sm">Create your first presential escrow</p>
          <Link href="/app/create">
            <Button variant="secondary" size="sm">
              <Plus className="h-4 w-4" />
              Create Escrow
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {escrows.map((escrow) => (
            <EscrowCard key={escrow.id} escrow={escrow} />
          ))}
        </div>
      )}
    </div>
  );
}
