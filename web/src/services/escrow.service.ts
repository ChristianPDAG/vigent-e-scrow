import type { WalletContextState } from "@solana/wallet-adapter-react";
import type {
  CreateEscrowInput,
  Escrow,
  EscrowFilters,
} from "@/types/escrow";
import type { ReleaseSession } from "@/types/release";
import { USE_MOCK } from "@/lib/constants";

const debugSupabase = process.env.NEXT_PUBLIC_DEBUG_SUPABASE === "true";

export interface IEscrowService {
  createEscrow(input: CreateEscrowInput, wallet: WalletContextState): Promise<Escrow>;
  getEscrow(id: string): Promise<Escrow | null>;
  listEscrows(walletAddress: string, filters?: EscrowFilters): Promise<Escrow[]>;
  getActiveReleaseSession?(escrow: Escrow): Promise<ReleaseSession | null>;
  fundEscrow(id: string, wallet: WalletContextState): Promise<{ txSignature: string }>;
  initiateRelease(
    escrowId: string,
    initiatorWalletOrWallet: string | WalletContextState,
    depositorWallet?: string
  ): Promise<ReleaseSession>;
  confirmRelease(
    sessionId: string,
    wallet: WalletContextState,
    role: "depositor" | "receiver"
  ): Promise<void>;
  executeRelease(
    sessionId: string,
    wallet?: WalletContextState,
    context?: { escrowId: string; depositorWallet: string }
  ): Promise<{ txSignature: string }>;
  refundEscrow(id: string, wallet: WalletContextState): Promise<{ txSignature: string }>;
}

let _service: IEscrowService | null = null;

export async function getEscrowService(): Promise<IEscrowService> {
  if (_service) return _service;
  if (USE_MOCK) {
    const { MockEscrowService } = await import("./escrow.mock");
    _service = new MockEscrowService();
    if (debugSupabase) console.log("[supabase-debug] escrow service selected", "mock");
  } else {
    const { SupabaseEscrowService } = await import("./escrow.supabase");
    _service = new SupabaseEscrowService();
    if (debugSupabase) console.log("[supabase-debug] escrow service selected", "supabase-primary");
  }
  return _service;
}
