export type EscrowStatus =
  | "created"
  | "funded"
  | "release_pending"
  | "released"
  | "expired"
  | "refunded";

export type TokenType = "SOL" | "USDC";

export interface Escrow {
  id: string;
  escrowPda: string | null;
  depositorWallet: string;
  receiverWallet: string;
  amount: number;
  displayAmount: number;
  tokenMint: string | null;
  tokenType: TokenType;
  description: string;
  status: EscrowStatus;
  expiresAt: string;
  createdAt: string;
  fundedAt: string | null;
  releasedAt: string | null;
  txSignature: string | null;
}

export interface CreateEscrowInput {
  receiverWallet: string;
  amount: number;
  tokenType: TokenType;
  description: string;
  expiresAt: string;
}

export interface EscrowFilters {
  status?: EscrowStatus;
  role?: "depositor" | "receiver";
}

export type EventType =
  | "escrow_created"
  | "escrow_funded"
  | "release_initiated"
  | "release_confirmed"
  | "release_completed"
  | "escrow_expired"
  | "escrow_refunded";

export interface ActivityEvent {
  id: string;
  escrowId: string;
  eventType: EventType;
  actorWallet: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
