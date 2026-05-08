import { create } from "zustand";
import type { ReleaseSession } from "@/types/release";

interface ReleaseStore {
  session: ReleaseSession | null;
  isConfirming: boolean;
  isExecuting: boolean;
  txSignature: string | null;
  error: string | null;
  setSession: (session: ReleaseSession | null) => void;
  updateSession: (updates: Partial<ReleaseSession>) => void;
  setConfirming: (v: boolean) => void;
  setExecuting: (v: boolean) => void;
  setTxSignature: (sig: string | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useReleaseStore = create<ReleaseStore>((set) => ({
  session: null,
  isConfirming: false,
  isExecuting: false,
  txSignature: null,
  error: null,
  setSession: (session) => set({ session }),
  updateSession: (updates) =>
    set((state) => ({
      session: state.session ? { ...state.session, ...updates } : null,
    })),
  setConfirming: (isConfirming) => set({ isConfirming }),
  setExecuting: (isExecuting) => set({ isExecuting }),
  setTxSignature: (txSignature) => set({ txSignature }),
  setError: (error) => set({ error }),
  reset: () =>
    set({ session: null, isConfirming: false, isExecuting: false, txSignature: null, error: null }),
}));
