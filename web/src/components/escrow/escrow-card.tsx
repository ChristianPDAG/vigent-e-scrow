"use client";

import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card } from "@/components/ui/card";
import { EscrowStatusBadge } from "@/components/ui/badge";
import { Countdown } from "@/components/ui/countdown";
import { truncateAddress, formatAmount } from "@/lib/utils";
import type { Escrow } from "@/types/escrow";
import { ArrowRight } from "lucide-react";

interface EscrowCardProps {
  escrow: Escrow;
}

export function EscrowCard({ escrow }: EscrowCardProps) {
  const router = useRouter();
  const { publicKey } = useWallet();
  const myWallet = publicKey?.toBase58() ?? "";
  const isDepositor = escrow.depositorWallet === myWallet;
  const counterparty = isDepositor ? escrow.receiverWallet : escrow.depositorWallet;

  return (
    <Card onClick={() => router.push(`/app/escrow/${escrow.id}`)} className="group">
      <div className="flex items-start justify-between gap-2 mb-3">
        <EscrowStatusBadge status={escrow.status} />
        <ArrowRight className="h-4 w-4 text-text-muted group-hover:text-primary transition-colors shrink-0" />
      </div>

      <div className="mb-3">
        <div className="text-2xl font-bold text-text-main">
          {formatAmount(escrow.displayAmount)} {escrow.tokenType}
        </div>
        <div className="text-sm text-text-muted mt-0.5">
          {isDepositor ? "→ " : "← "}
          <span className="font-mono">{truncateAddress(counterparty)}</span>
          <span className="ml-1 text-xs">{isDepositor ? "(receiver)" : "(depositor)"}</span>
        </div>
      </div>

      {escrow.description && (
        <p className="text-sm text-text-secondary mb-3 line-clamp-2">{escrow.description}</p>
      )}

      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>
          {new Date(escrow.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {escrow.status !== "released" && escrow.status !== "expired" && (
          <Countdown expiresAt={escrow.expiresAt} compact />
        )}
      </div>
    </Card>
  );
}
