"use client";

import { useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getEscrowService } from "@/services/escrow.service";
import { useEscrowStore } from "@/stores/escrow.store";
import type { CreateEscrowInput, EscrowFilters } from "@/types/escrow";

export function useEscrow() {
  const { publicKey, ...wallet } = useWallet();
  const { escrows, isLoading, error, setEscrows, upsertEscrow, setLoading, setError } =
    useEscrowStore();

  const fetchEscrows = useCallback(
    async (filters?: EscrowFilters) => {
      if (!publicKey) return;
      setLoading(true);
      setError(null);
      try {
        const svc = await getEscrowService();
        const data = await svc.listEscrows(publicKey.toBase58(), filters);
        setEscrows(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch escrows");
      } finally {
        setLoading(false);
      }
    },
    [publicKey, setEscrows, setLoading, setError]
  );

  const createEscrow = useCallback(
    async (input: CreateEscrowInput) => {
      if (!publicKey) throw new Error("Wallet not connected");
      const svc = await getEscrowService();
      const escrow = await svc.createEscrow(input, publicKey.toBase58());
      upsertEscrow(escrow);
      return escrow;
    },
    [publicKey, upsertEscrow]
  );

  const fundEscrow = useCallback(
    async (id: string) => {
      const svc = await getEscrowService();
      const result = await svc.fundEscrow(id, { publicKey, ...wallet } as never);
      const updated = await svc.getEscrow(id);
      if (updated) upsertEscrow(updated);
      return result;
    },
    [publicKey, wallet, upsertEscrow]
  );

  return { escrows, isLoading, error, fetchEscrows, createEscrow, fundEscrow };
}
