// Anchor implementation — wired in Phase 6 once IDL is available from contract team
// Implements the same IEscrowService interface as MockEscrowService

import type { WalletContextState } from "@solana/wallet-adapter-react";
import type { CreateEscrowInput, Escrow, EscrowFilters } from "@/types/escrow";
import type { ReleaseSession } from "@/types/release";
import type { IEscrowService } from "./escrow.service";

export class AnchorEscrowService implements IEscrowService {
  async createEscrow(_input: CreateEscrowInput, _depositorWallet: string): Promise<Escrow> {
    throw new Error("AnchorEscrowService: not implemented — waiting for IDL");
  }

  async getEscrow(_id: string): Promise<Escrow | null> {
    throw new Error("AnchorEscrowService: not implemented — waiting for IDL");
  }

  async listEscrows(_walletAddress: string, _filters?: EscrowFilters): Promise<Escrow[]> {
    throw new Error("AnchorEscrowService: not implemented — waiting for IDL");
  }

  async fundEscrow(_id: string, _wallet: WalletContextState): Promise<{ txSignature: string }> {
    throw new Error("AnchorEscrowService: not implemented — waiting for IDL");
  }

  async initiateRelease(
    _escrowId: string,
    _initiatorWallet: string
  ): Promise<ReleaseSession> {
    throw new Error("AnchorEscrowService: not implemented — waiting for IDL");
  }

  async confirmRelease(
    _sessionId: string,
    _wallet: WalletContextState,
    _role: "depositor" | "receiver"
  ): Promise<void> {
    throw new Error("AnchorEscrowService: not implemented — waiting for IDL");
  }

  async executeRelease(_sessionId: string): Promise<{ txSignature: string }> {
    throw new Error("AnchorEscrowService: not implemented — waiting for IDL");
  }

  async refundEscrow(_id: string, _wallet: WalletContextState): Promise<{ txSignature: string }> {
    throw new Error("AnchorEscrowService: not implemented — waiting for IDL");
  }
}
