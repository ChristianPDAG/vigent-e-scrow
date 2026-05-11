import type { WalletContextState } from "@solana/wallet-adapter-react";
import type {
  CreateEscrowInput,
  Escrow,
  EscrowFilters,
} from "@/types/escrow";
import type { ReleaseSession } from "@/types/release";
import { USE_MOCK } from "@/lib/constants";

export interface IEscrowService {
  createEscrow(input: CreateEscrowInput, wallet: WalletContextState): Promise<Escrow>;
  getEscrow(id: string): Promise<Escrow | null>;
  listEscrows(walletAddress: string, filters?: EscrowFilters): Promise<Escrow[]>;
  fundEscrow(id: string, wallet: WalletContextState): Promise<{ txSignature: string }>;
  initiateRelease(escrowId: string, initiatorWallet: string): Promise<ReleaseSession>;
  confirmRelease(
    sessionId: string,
    wallet: WalletContextState,
    role: "depositor" | "receiver"
  ): Promise<void>;
  executeRelease(sessionId: string): Promise<{ txSignature: string }>;
  refundEscrow(id: string, wallet: WalletContextState): Promise<{ txSignature: string }>;
}

let _service: IEscrowService | null = null;

export async function getEscrowService(): Promise<IEscrowService> {
  if (_service) return _service;
  if (USE_MOCK) {
    const { MockEscrowService } = await import("./escrow.mock");
    _service = new MockEscrowService();
  } else {
    const { AnchorEscrowService } = await import("./escrow.anchor");
    _service = new AnchorEscrowService();
  }
  return _service;
}
