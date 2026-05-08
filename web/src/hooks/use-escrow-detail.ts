"use client";

import { useCallback, useEffect } from "react";
import { getEscrowService } from "@/services/escrow.service";
import { useEscrowStore } from "@/stores/escrow.store";

export function useEscrowDetail(id: string) {
  const { selectedEscrow, isLoading, error, setSelectedEscrow, setLoading, setError } =
    useEscrowStore();

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const svc = await getEscrowService();
      const escrow = await svc.getEscrow(id);
      setSelectedEscrow(escrow);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load escrow");
    } finally {
      setLoading(false);
    }
  }, [id, setLoading, setError, setSelectedEscrow]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { escrow: selectedEscrow, isLoading, error, refetch: fetch };
}
