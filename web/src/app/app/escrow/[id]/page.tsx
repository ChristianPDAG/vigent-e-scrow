"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { useEscrowDetail } from "@/hooks/use-escrow-detail";
import { useEscrow } from "@/hooks/use-escrow";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EscrowStatusBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Countdown } from "@/components/ui/countdown";
import { truncateAddress, formatAmount, explorerUrl } from "@/lib/utils";
import {
  ArrowLeft,
  Copy,
  CheckCheck,
  ExternalLink,
  Zap,
  QrCode,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 font-mono text-sm text-text-secondary hover:text-accent transition-colors"
    >
      {truncateAddress(address)}
      {copied ? <CheckCheck className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export default function EscrowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { publicKey } = useWallet();
  const { escrow, isLoading, error } = useEscrowDetail(id);
  const { fundEscrow } = useEscrow();
  const [funding, setFunding] = useState(false);

  const myWallet = publicKey?.toBase58() ?? "";
  const isDepositor = escrow?.depositorWallet === myWallet;
  const isReceiver = escrow?.receiverWallet === myWallet;

  async function handleFund() {
    if (!escrow) return;
    setFunding(true);
    try {
      await fundEscrow(escrow.id);
      toast.success("Escrow funded successfully!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fund failed");
    } finally {
      setFunding(false);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !escrow) {
    return (
      <div className="flex flex-col items-center gap-3 py-24">
        <AlertCircle className="h-12 w-12 text-danger" />
        <p className="text-text-secondary">Escrow not found</p>
        <Link href="/app"><Button variant="ghost" size="sm">Back to dashboard</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-text-main">Escrow Detail</h1>
          <p className="text-xs font-mono text-text-muted">{id}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Amount + Status */}
        <Card>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-4xl font-bold text-text-main">
                {formatAmount(escrow.displayAmount)} {escrow.tokenType}
              </div>
              <div className="text-sm text-text-muted mt-1">
                {escrow.status === "released"
                  ? "Released"
                  : escrow.status === "expired"
                  ? "Expired"
                  : "Expires in "}
                {escrow.status !== "released" && escrow.status !== "expired" && (
                  <Countdown expiresAt={escrow.expiresAt} compact />
                )}
              </div>
            </div>
            <EscrowStatusBadge status={escrow.status} />
          </div>

          {escrow.description && (
            <p className="text-text-secondary text-sm border-t border-border pt-4">
              {escrow.description}
            </p>
          )}
        </Card>

        {/* Parties */}
        <Card>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
            Parties
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Depositor</span>
              <div className="flex items-center gap-2">
                {isDepositor && (
                  <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">you</span>
                )}
                <CopyAddress address={escrow.depositorWallet} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Receiver</span>
              <div className="flex items-center gap-2">
                {isReceiver && (
                  <span className="text-xs text-accent bg-accent/10 px-1.5 py-0.5 rounded">you</span>
                )}
                <CopyAddress address={escrow.receiverWallet} />
              </div>
            </div>
          </div>
        </Card>

        {/* Timestamps */}
        <Card>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
            Timeline
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Created</span>
              <span className="text-text-main font-mono text-xs">
                {new Date(escrow.createdAt).toLocaleString()}
              </span>
            </div>
            {escrow.fundedAt && (
              <div className="flex justify-between">
                <span className="text-text-secondary">Funded</span>
                <span className="text-text-main font-mono text-xs">
                  {new Date(escrow.fundedAt).toLocaleString()}
                </span>
              </div>
            )}
            {escrow.releasedAt && (
              <div className="flex justify-between">
                <span className="text-success">Released</span>
                <span className="text-text-main font-mono text-xs">
                  {new Date(escrow.releasedAt).toLocaleString()}
                </span>
              </div>
            )}
            {escrow.txSignature && (
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Tx</span>
                <a
                  href={explorerUrl(escrow.txSignature)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-accent hover:underline font-mono text-xs"
                >
                  {truncateAddress(escrow.txSignature, 8)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </Card>

        {/* Actions */}
        {escrow.status === "created" && isDepositor && (
          <Button onClick={handleFund} loading={funding} size="lg" className="w-full">
            <Zap className="h-4 w-4" />
            Fund Escrow
          </Button>
        )}

        {escrow.status === "funded" && isReceiver && (
          <Link href={`/app/escrow/${escrow.id}/release`} className="block">
            <Button size="lg" className="w-full">
              <QrCode className="h-4 w-4" />
              Initiate Release
            </Button>
          </Link>
        )}

        {escrow.status === "funded" && isDepositor && (
          <Button variant="secondary" size="lg" className="w-full" disabled>
            Request Refund — Coming Soon
          </Button>
        )}

        {escrow.status === "release_pending" && (
          <Link href={`/app/escrow/${escrow.id}/release`} className="block">
            <Button variant="accent" size="lg" className="w-full">
              <QrCode className="h-4 w-4" />
              View Release Session
            </Button>
          </Link>
        )}

        {escrow.status === "released" && escrow.txSignature && (
          <a href={explorerUrl(escrow.txSignature)} target="_blank" rel="noopener noreferrer">
            <Button variant="accent" size="lg" className="w-full">
              <ExternalLink className="h-4 w-4" />
              View on Solana Explorer
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
