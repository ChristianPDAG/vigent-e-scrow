import { create } from "zustand";
import type { Escrow } from "@/types/escrow";

interface EscrowStore {
  escrows: Escrow[];
  selectedEscrow: Escrow | null;
  isLoading: boolean;
  error: string | null;
  setEscrows: (escrows: Escrow[]) => void;
  upsertEscrow: (escrow: Escrow) => void;
  setSelectedEscrow: (escrow: Escrow | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useEscrowStore = create<EscrowStore>((set) => ({
  escrows: [],
  selectedEscrow: null,
  isLoading: false,
  error: null,
  setEscrows: (escrows) => set({ escrows }),
  upsertEscrow: (escrow) =>
    set((state) => {
      const idx = state.escrows.findIndex((e) => e.id === escrow.id);
      if (idx === -1) {
        return { escrows: [escrow, ...state.escrows] };
      }
      const updated = [...state.escrows];
      updated[idx] = escrow;
      return { escrows: updated, selectedEscrow: state.selectedEscrow?.id === escrow.id ? escrow : state.selectedEscrow };
    }),
  setSelectedEscrow: (escrow) => set({ selectedEscrow: escrow }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
