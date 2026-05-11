export type ReleaseSessionStatus =
  | "pending"
  | "depositor_confirmed"
  | "receiver_confirmed"
  | "both_confirmed"
  | "completed"
  | "expired"
  | "failed";

export interface ReleaseSession {
  id: string;
  escrowId: string;
  token: string;
  status: ReleaseSessionStatus;
  initiatedBy: string;
  depositorConfirmed: boolean;
  receiverConfirmed: boolean;
  depositorConfirmedAt: string | null;
  receiverConfirmedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface QRPayload {
  sessionId: string;
  escrowId: string;
  token: string;
  receiverWallet: string;
  depositorWallet?: string;
  expiresAt?: string;
}
