"use client";

import { useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { getEscrowService } from "@/services/escrow.service";
import { useReleaseStore } from "@/stores/release.store";
import { useEscrowStore } from "@/stores/escrow.store";
import type { QRPayload, ReleaseSession } from "@/types/release";

interface ReleaseContext {
  escrowId: string;
  depositorWallet: string;
}

function isWaitingForOtherParty(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("NotFullyConfirmed") || message.includes("not fully confirmed");
}

export function useReleaseSession() {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { session, isConfirming, isExecuting, txSignature, error, setSession, setConfirming, setExecuting, setTxSignature, setError, reset } =
    useReleaseStore();
  const { upsertEscrow } = useEscrowStore();

  const hydrateSessionFromQr = useCallback(
    (payload: QRPayload): ReleaseSession => {
      const hydrated: ReleaseSession = {
        id: payload.sessionId,
        escrowId: payload.escrowId,
        token: payload.token,
        status: "pending",
        initiatedBy: payload.receiverWallet,
        depositorConfirmed: false,
        receiverConfirmed: false,
        depositorConfirmedAt: null,
        receiverConfirmedAt: null,
        completedAt: null,
        expiresAt: payload.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      };

      setSession(hydrated);
      return hydrated;
    },
    [setSession]
  );

  const initiateRelease = useCallback(
    async (escrowId: string, depositorWallet: string) => {
      if (!publicKey) throw new Error("Wallet not connected");
      const svc = await getEscrowService();
      const newSession = await svc.initiateRelease(escrowId, wallet, depositorWallet);
      setSession(newSession);
      return newSession;
    },
    [publicKey, wallet, setSession]
  );

  const confirmRelease = useCallback(
    async (role: "depositor" | "receiver", context: ReleaseContext) => {
      if (!session) throw new Error("No active session");
      setConfirming(true);
      setError(null);
      try {
        const svc = await getEscrowService();
        if ("confirmReleaseWithEscrowId" in svc) {
          await (svc as typeof svc & {
            confirmReleaseWithEscrowId: (
              escrowId: string,
              sessionHashHex: string,
              wallet: WalletContextState,
              role: "depositor" | "receiver",
              depositorWallet?: string
            ) => Promise<{ txSignature: string }>;
          }).confirmReleaseWithEscrowId(
            context.escrowId,
            session.token,
            wallet,
            role,
            context.depositorWallet
          );
        } else {
          await svc.confirmRelease(session.id, wallet as never, role);
        }

        const now = new Date().toISOString();
        const depositorConfirmed = role === "depositor" ? true : session.depositorConfirmed;
        const receiverConfirmed = role === "receiver" ? true : session.receiverConfirmed;
        const bothConfirmed = depositorConfirmed && receiverConfirmed;

        setSession({
          ...session,
          depositorConfirmed,
          receiverConfirmed,
          depositorConfirmedAt: role === "depositor" ? now : session.depositorConfirmedAt,
          receiverConfirmedAt: role === "receiver" ? now : session.receiverConfirmedAt,
          status: bothConfirmed
            ? "both_confirmed"
            : role === "depositor"
              ? "depositor_confirmed"
              : "receiver_confirmed",
        });

        try {
          await executeRelease(context);
        } catch (releaseError) {
          if (!bothConfirmed && isWaitingForOtherParty(releaseError)) {
            setError(null);
          } else {
            throw releaseError;
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Confirmation failed");
        throw e;
      } finally {
        setConfirming(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, wallet, setConfirming, setError, setSession]
  );

  const executeRelease = useCallback(async (context: ReleaseContext) => {
    if (!session) return;
    setExecuting(true);
    try {
      const svc = await getEscrowService();
      const { txSignature: sig } = await svc.executeRelease(session.id, wallet, context);
      setTxSignature(sig);
      setSession({ ...session, status: "completed", completedAt: new Date().toISOString() });

      const updated = await svc.getEscrow(session.escrowId);
      if (updated) upsertEscrow(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Release failed");
      throw e;
    } finally {
      setExecuting(false);
    }
  }, [session, wallet, setExecuting, setTxSignature, setSession, setError, upsertEscrow]);

  return {
    session,
    isConfirming,
    isExecuting,
    txSignature,
    error,
    hydrateSessionFromQr,
    initiateRelease,
    confirmRelease,
    reset,
  };
}
