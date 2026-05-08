"use client";

import { useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getEscrowService } from "@/services/escrow.service";
import { useReleaseStore } from "@/stores/release.store";
import { useEscrowStore } from "@/stores/escrow.store";

export function useReleaseSession() {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { session, isConfirming, isExecuting, txSignature, error, setSession, setConfirming, setExecuting, setTxSignature, setError, reset } =
    useReleaseStore();
  const { upsertEscrow } = useEscrowStore();

  const initiateRelease = useCallback(
    async (escrowId: string) => {
      if (!publicKey) throw new Error("Wallet not connected");
      const svc = await getEscrowService();
      const newSession = await svc.initiateRelease(escrowId, publicKey.toBase58());
      setSession(newSession);
      return newSession;
    },
    [publicKey, setSession]
  );

  const confirmRelease = useCallback(
    async (role: "depositor" | "receiver") => {
      if (!session) throw new Error("No active session");
      setConfirming(true);
      setError(null);
      try {
        const svc = await getEscrowService();
        await svc.confirmRelease(session.id, wallet as never, role);

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

        if (bothConfirmed) {
          await executeRelease();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Confirmation failed");
      } finally {
        setConfirming(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, wallet, setConfirming, setError, setSession]
  );

  const executeRelease = useCallback(async () => {
    if (!session) return;
    setExecuting(true);
    try {
      const svc = await getEscrowService();
      const { txSignature: sig } = await svc.executeRelease(session.id);
      setTxSignature(sig);
      setSession({ ...session, status: "completed", completedAt: new Date().toISOString() });

      const updated = await svc.getEscrow(session.escrowId);
      if (updated) upsertEscrow(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Release failed");
    } finally {
      setExecuting(false);
    }
  }, [session, setExecuting, setTxSignature, setSession, setError, upsertEscrow]);

  return {
    session,
    isConfirming,
    isExecuting,
    txSignature,
    error,
    initiateRelease,
    confirmRelease,
    reset,
  };
}
