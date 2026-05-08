import type { WalletContextState } from "@solana/wallet-adapter-react";
import type {
  CreateEscrowInput,
  Escrow,
  EscrowFilters,
  ActivityEvent,
} from "@/types/escrow";
import type { ReleaseSession } from "@/types/release";
import { randomDelay } from "@/lib/utils";
import { RELEASE_SESSION_TTL_MINUTES } from "@/lib/constants";
import type { IEscrowService } from "./escrow.service";

const DEMO_WALLET_A = "DemoWa11etA11111111111111111111111111111111";
const DEMO_WALLET_B = "DemoWa11etB11111111111111111111111111111111";

const seedEscrows: Escrow[] = [
  {
    id: "escrow-001",
    escrowPda: "EscrowPDA1111111111111111111111111111111111",
    depositorWallet: DEMO_WALLET_A,
    receiverWallet: DEMO_WALLET_B,
    amount: 500_000_000,
    displayAmount: 0.5,
    tokenMint: null,
    tokenType: "SOL",
    description: "Payment for vintage guitar — confirmed on meeting",
    status: "funded",
    expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    fundedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    releasedAt: null,
    txSignature: "5xMockFundTx111111111111111111111111111111111111111111111111111111",
  },
  {
    id: "escrow-002",
    escrowPda: null,
    depositorWallet: DEMO_WALLET_B,
    receiverWallet: DEMO_WALLET_A,
    amount: 1_000_000_000,
    displayAmount: 1.0,
    tokenMint: null,
    tokenType: "SOL",
    description: "Freelance design work — final deliverables",
    status: "created",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    fundedAt: null,
    releasedAt: null,
    txSignature: null,
  },
  {
    id: "escrow-003",
    escrowPda: "EscrowPDA3333333333333333333333333333333333",
    depositorWallet: DEMO_WALLET_A,
    receiverWallet: DEMO_WALLET_B,
    amount: 2_000_000_000,
    displayAmount: 2.0,
    tokenMint: null,
    tokenType: "SOL",
    description: "Vintage watch collection — presential exchange",
    status: "released",
    expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    fundedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(),
    releasedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 2 * 60 * 1000).toISOString(),
    txSignature: "7xMockReleaseTx3333333333333333333333333333333333333333333333333",
  },
];

const escrows = new Map<string, Escrow>(seedEscrows.map((e) => [e.id, e]));
const sessions = new Map<string, ReleaseSession>();
const activityLog = new Map<string, ActivityEvent[]>();

function addActivity(escrowId: string, event: ActivityEvent) {
  const existing = activityLog.get(escrowId) ?? [];
  activityLog.set(escrowId, [...existing, event]);
}

function makeActivity(
  escrowId: string,
  eventType: ActivityEvent["eventType"],
  actorWallet: string,
  metadata: Record<string, unknown> = {}
): ActivityEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    escrowId,
    eventType,
    actorWallet,
    metadata,
    createdAt: new Date().toISOString(),
  };
}

export class MockEscrowService implements IEscrowService {
  async createEscrow(input: CreateEscrowInput, depositorWallet: string): Promise<Escrow> {
    await randomDelay();
    const id = `escrow-${Date.now()}`;
    const escrow: Escrow = {
      id,
      escrowPda: null,
      depositorWallet,
      receiverWallet: input.receiverWallet,
      amount: Math.round(input.amount * 1_000_000_000),
      displayAmount: input.amount,
      tokenMint: null,
      tokenType: input.tokenType,
      description: input.description,
      status: "created",
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
      fundedAt: null,
      releasedAt: null,
      txSignature: null,
    };
    escrows.set(id, escrow);
    addActivity(id, makeActivity(id, "escrow_created", depositorWallet));
    return escrow;
  }

  async getEscrow(id: string): Promise<Escrow | null> {
    await randomDelay(100, 300);
    return escrows.get(id) ?? null;
  }

  async listEscrows(walletAddress: string, filters?: EscrowFilters): Promise<Escrow[]> {
    await randomDelay(200, 500);
    let result = [...escrows.values()];

    const role = filters?.role;
    if (role === "depositor") {
      result = result.filter((e) => e.depositorWallet === walletAddress);
    } else if (role === "receiver") {
      result = result.filter((e) => e.receiverWallet === walletAddress);
    } else {
      result = result.filter(
        (e) => e.depositorWallet === walletAddress || e.receiverWallet === walletAddress
      );
    }

    if (filters?.status) {
      result = result.filter((e) => e.status === filters.status);
    }

    return result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async fundEscrow(id: string): Promise<{ txSignature: string }> {
    await randomDelay(800, 1500);
    const escrow = escrows.get(id);
    if (!escrow) throw new Error("Escrow not found");
    if (escrow.status !== "created") throw new Error("Escrow is not in created state");

    const txSignature = `mock-fund-${Date.now()}`;
    const updated: Escrow = {
      ...escrow,
      status: "funded",
      fundedAt: new Date().toISOString(),
      escrowPda: `MockPDA${id}`,
      txSignature,
    };
    escrows.set(id, updated);
    addActivity(id, makeActivity(id, "escrow_funded", escrow.depositorWallet, { txSignature }));
    return { txSignature };
  }

  async initiateRelease(escrowId: string, initiatorWallet: string): Promise<ReleaseSession> {
    await randomDelay();
    const escrow = escrows.get(escrowId);
    if (!escrow) throw new Error("Escrow not found");
    if (escrow.status !== "funded") throw new Error("Escrow must be funded to initiate release");

    const sessionId = `session-${Date.now()}`;
    const token = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + RELEASE_SESSION_TTL_MINUTES * 60 * 1000
    ).toISOString();

    const session: ReleaseSession = {
      id: sessionId,
      escrowId,
      token,
      status: "pending",
      initiatedBy: initiatorWallet,
      depositorConfirmed: false,
      receiverConfirmed: false,
      depositorConfirmedAt: null,
      receiverConfirmedAt: null,
      completedAt: null,
      expiresAt,
      createdAt: new Date().toISOString(),
    };
    sessions.set(sessionId, session);

    const updatedEscrow: Escrow = { ...escrow, status: "release_pending" };
    escrows.set(escrowId, updatedEscrow);
    addActivity(escrowId, makeActivity(escrowId, "release_initiated", initiatorWallet));
    return session;
  }

  async confirmRelease(
    sessionId: string,
    _wallet: WalletContextState,
    role: "depositor" | "receiver"
  ): Promise<void> {
    await randomDelay(500, 1000);
    const session = sessions.get(sessionId);
    if (!session) throw new Error("Session not found");
    if (new Date(session.expiresAt) < new Date()) throw new Error("Session expired");

    const now = new Date().toISOString();
    const updated: ReleaseSession = {
      ...session,
      depositorConfirmed: role === "depositor" ? true : session.depositorConfirmed,
      receiverConfirmed: role === "receiver" ? true : session.receiverConfirmed,
      depositorConfirmedAt: role === "depositor" ? now : session.depositorConfirmedAt,
      receiverConfirmedAt: role === "receiver" ? now : session.receiverConfirmedAt,
      status:
        (role === "depositor" ? true : session.depositorConfirmed) &&
        (role === "receiver" ? true : session.receiverConfirmed)
          ? "both_confirmed"
          : role === "depositor"
          ? "depositor_confirmed"
          : "receiver_confirmed",
    };
    sessions.set(sessionId, updated);

    const escrow = escrows.get(session.escrowId);
    if (escrow) {
      addActivity(
        session.escrowId,
        makeActivity(session.escrowId, "release_confirmed", _wallet.publicKey?.toBase58() ?? "", { role })
      );
    }
  }

  async executeRelease(sessionId: string): Promise<{ txSignature: string }> {
    await randomDelay(1000, 2000);
    const session = sessions.get(sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "both_confirmed") throw new Error("Both parties must confirm first");

    const txSignature = `mock-release-${Date.now()}`;
    const now = new Date().toISOString();

    const updatedSession: ReleaseSession = {
      ...session,
      status: "completed",
      completedAt: now,
    };
    sessions.set(sessionId, updatedSession);

    const escrow = escrows.get(session.escrowId);
    if (escrow) {
      const updatedEscrow: Escrow = {
        ...escrow,
        status: "released",
        releasedAt: now,
        txSignature,
      };
      escrows.set(session.escrowId, updatedEscrow);
      addActivity(
        session.escrowId,
        makeActivity(session.escrowId, "release_completed", session.initiatedBy, { txSignature })
      );
    }

    return { txSignature };
  }

  async refundEscrow(id: string): Promise<{ txSignature: string }> {
    await randomDelay(800, 1500);
    const escrow = escrows.get(id);
    if (!escrow) throw new Error("Escrow not found");

    const txSignature = `mock-refund-${Date.now()}`;
    const updated: Escrow = {
      ...escrow,
      status: "refunded",
      txSignature,
    };
    escrows.set(id, updated);
    addActivity(id, makeActivity(id, "escrow_refunded", escrow.depositorWallet, { txSignature }));
    return { txSignature };
  }

  getActivityLog(escrowId: string): ActivityEvent[] {
    return activityLog.get(escrowId) ?? [];
  }

  getSession(sessionId: string): ReleaseSession | null {
    return sessions.get(sessionId) ?? null;
  }
}
