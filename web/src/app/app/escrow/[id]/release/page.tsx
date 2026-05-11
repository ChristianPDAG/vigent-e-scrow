"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { useEscrowDetail } from "@/hooks/use-escrow-detail";
import { useReleaseSession } from "@/hooks/use-release-session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import { Skeleton } from "@/components/ui/skeleton";
import { explorerUrl, formatAmount } from "@/lib/utils";
import QRCode from "react-qr-code";
import type { QRPayload } from "@/types/release";
import {
  CheckCircle,
  Circle,
  ExternalLink,
  ArrowLeft,
  Loader2,
  Copy,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";

function SuccessView({ txSignature, escrowId }: { txSignature: string; escrowId: string }) {
  useEffect(() => {
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ["#8B5CF6", "#14F1D9", "#7CFF6B"] });
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10 border-2 border-success animate-pulse">
        <CheckCircle className="h-10 w-10 text-success" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-success mb-2">Funds Released!</h2>
        <p className="text-text-secondary">
          The escrow has been successfully released on Solana.
        </p>
      </div>
      {txSignature && !txSignature.startsWith("mock") && (
        <a href={explorerUrl(txSignature)} target="_blank" rel="noopener noreferrer">
          <Button variant="accent">
            <ExternalLink className="h-4 w-4" />
            View on Explorer
          </Button>
        </a>
      )}
      <Link href={`/app/escrow/${escrowId}`}>
        <Button variant="ghost">Back to escrow</Button>
      </Link>
    </div>
  );
}

function CopyTokenButton({ value, label }: { value: string; label: string }) {
  async function copy() {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  }

  return (
    <Button variant="secondary" size="sm" onClick={copy}>
      <Copy className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

export default function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { publicKey } = useWallet();
  const { escrow, isLoading } = useEscrowDetail(id);
  const {
    session,
    isConfirming,
    isExecuting,
    txSignature,
    error,
    hydrateSessionFromQr,
    initiateRelease,
    confirmRelease,
    reset,
  } = useReleaseSession();
  const [initiating, setInitiating] = useState(false);

  const myWallet = publicKey?.toBase58() ?? "";
  const isReceiver = escrow?.receiverWallet === myWallet;
  const isDepositor = escrow?.depositorWallet === myWallet;

  useEffect(() => {
    return () => { reset(); };
  }, [reset]);

  useEffect(() => {
    if (!escrow || session) return;
    const sessionId = searchParams.get("sessionId");
    const token = searchParams.get("token");
    if (!sessionId || !token) return;

    hydrateSessionFromQr({
      sessionId,
      escrowId: id,
      token,
      receiverWallet: searchParams.get("receiverWallet") ?? escrow.receiverWallet,
      depositorWallet: searchParams.get("depositorWallet") ?? escrow.depositorWallet,
      expiresAt: searchParams.get("expiresAt") ?? undefined,
    });
  }, [escrow, hydrateSessionFromQr, id, searchParams, session]);

  async function handleInitiate() {
    if (!publicKey || !escrow) return;
    setInitiating(true);
    try {
      await initiateRelease(escrow.id, escrow.depositorWallet);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to initiate release");
    } finally {
      setInitiating(false);
    }
  }

  async function handleConfirm(role: "depositor" | "receiver") {
    try {
      if (!escrow) throw new Error("Escrow not found");
      await confirmRelease(role, {
        escrowId: escrow.id,
        depositorWallet: escrow.depositorWallet,
      });
      toast.success("Confirmation submitted!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Confirmation failed");
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!escrow) {
    return (
      <div className="text-center py-24 text-text-muted">Escrow not found</div>
    );
  }

  if (txSignature) {
    return (
      <div className="max-w-lg mx-auto">
        <SuccessView txSignature={txSignature} escrowId={id} />
      </div>
    );
  }

  const qrPayload: QRPayload = session
    ? {
      sessionId: session.id,
      escrowId: id,
      token: session.token,
      receiverWallet: escrow.receiverWallet,
      depositorWallet: escrow.depositorWallet,
      expiresAt: session.expiresAt,
    }
    : { sessionId: "", escrowId: id, token: "", receiverWallet: "", depositorWallet: "" };
  const qrPayloadText = JSON.stringify(qrPayload);

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-text-main">Release Ceremony</h1>
          <p className="text-sm text-text-muted">
            {formatAmount(escrow.displayAmount)} {escrow.tokenType}
          </p>
        </div>
        {session && (
          <div className="ml-auto">
            <Countdown expiresAt={session.expiresAt} compact />
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Step 1: Receiver initiates */}
      {!session && isReceiver && escrow.status === "funded" && (
        <Card className="text-center p-8">
          <div className="mb-4 text-4xl">🤝</div>
          <h2 className="text-lg font-semibold text-text-main mb-2">Ready to meet?</h2>
          <p className="text-text-muted text-sm mb-6">
            Initiate the release to generate a secure QR code. Show it to the depositor when you meet in person.
          </p>
          <Button onClick={handleInitiate} loading={initiating} size="lg">
            Generate QR Code
          </Button>
        </Card>
      )}

      {/* QR Display for Receiver */}
      {session && isReceiver && (
        <div className="space-y-4">
          <Card className="text-center p-6">
            <p className="text-sm text-text-muted mb-4">Show this QR to the depositor</p>
            <div className="flex justify-center mb-4">
              <div className="bg-white p-4 rounded-xl">
                <QRCode
                  value={JSON.stringify(qrPayload)}
                  size={220}
                  fgColor="#0B1020"
                />
              </div>
            </div>
            <div className="mt-4 space-y-3 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase text-text-muted">Session Token</span>
                <div className="flex gap-2">
                  <CopyTokenButton value={session.token} label="Copy token" />
                  <CopyTokenButton value={qrPayloadText} label="Copy payload" />
                </div>
              </div>
              <div className="max-h-28 overflow-y-auto rounded-lg border border-border bg-bg-base p-3 text-xs font-mono leading-relaxed text-text-secondary break-all">
                {session.token}
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-text-secondary mb-3">Confirmation Status</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {session.depositorConfirmed ? (
                  <CheckCircle className="h-5 w-5 text-success" />
                ) : (
                  <Circle className="h-5 w-5 text-text-muted" />
                )}
                <div>
                  <span className="text-sm font-medium text-text-main">Depositor</span>
                  {session.depositorConfirmed && (
                    <span className="ml-2 text-xs text-success">Confirmed</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {session.receiverConfirmed ? (
                  <CheckCircle className="h-5 w-5 text-success" />
                ) : (
                  <Circle className="h-5 w-5 text-text-muted" />
                )}
                <div>
                  <span className="text-sm font-medium text-text-main">Receiver (you)</span>
                  {session.receiverConfirmed && (
                    <span className="ml-2 text-xs text-success">Confirmed</span>
                  )}
                </div>
              </div>
            </div>

            {!session.receiverConfirmed && (
              <Button
                onClick={() => handleConfirm("receiver")}
                loading={isConfirming || isExecuting}
                size="lg"
                className="w-full mt-4"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Releasing funds...
                  </>
                ) : (
                  "Confirm & Sign Release"
                )}
              </Button>
            )}
          </Card>
        </div>
      )}

      {/* Depositor confirmation view (after scanning QR) */}
      {session && isDepositor && !session.depositorConfirmed && (
        <Card className="text-center p-8 space-y-4">
          <div className="text-4xl">✅</div>
          <h2 className="text-lg font-semibold text-text-main">Confirm Release</h2>
          <p className="text-text-muted text-sm">
            You are releasing{" "}
            <strong className="text-text-main">
              {formatAmount(escrow.displayAmount)} {escrow.tokenType}
            </strong>{" "}
            to the receiver. This action is irreversible.
          </p>
          <Button
            onClick={() => handleConfirm("depositor")}
            loading={isConfirming}
            size="lg"
            className="w-full"
          >
            Confirm & Sign
          </Button>
        </Card>
      )}

      {session && isDepositor && session.depositorConfirmed && !txSignature && (
        <Card className="text-center p-8 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-text-secondary">Waiting for receiver to confirm...</p>
        </Card>
      )}

      {/* Non-participant view */}
      {!isDepositor && !isReceiver && (
        <Card className="text-center p-8">
          <p className="text-text-muted">You are not a participant in this escrow.</p>
          <Link href="/app/scan" className="block mt-4">
            <Button variant="secondary">Scan a QR code instead</Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
