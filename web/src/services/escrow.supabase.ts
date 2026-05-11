import type { WalletContextState } from "@solana/wallet-adapter-react";
import type {
    ActivityEvent,
    CreateEscrowInput,
    Escrow,
    EscrowFilters,
    EscrowStatus,
} from "@/types/escrow";
import type { ReleaseSession, ReleaseSessionStatus } from "@/types/release";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { SOLANA_NETWORK } from "@/lib/constants";
import type { IEscrowService } from "./escrow.service";
import { AnchorEscrowService } from "./escrow.anchor";

const debugSupabase = process.env.NEXT_PUBLIC_DEBUG_SUPABASE === "true";

type EscrowRow = {
    id: string;
    escrow_pda: string | null;
    depositor_wallet: string;
    receiver_wallet: string;
    amount: number | string;
    display_amount: number | string;
    token_mint: string | null;
    token_type: Escrow["tokenType"];
    description: string;
    status: EscrowStatus;
    expires_at: string;
    funded_at: string | null;
    released_at: string | null;
    tx_signature: string | null;
    created_at: string;
};

type ReleaseSessionRow = {
    id: string;
    escrow_id: string;
    token: string;
    status: ReleaseSessionStatus;
    initiated_by: string;
    depositor_confirmed: boolean;
    receiver_confirmed: boolean;
    depositor_confirmed_at: string | null;
    receiver_confirmed_at: string | null;
    completed_at: string | null;
    expires_at: string;
    created_at: string;
};

type SupabaseErrorLike = {
    code?: string;
    message?: string;
    details?: string | null;
    hint?: string | null;
};

function assertSupabaseConfigured() {
    if (!isSupabaseConfigured) {
        throw new Error("Supabase is not configured");
    }
}

function isSupabaseConfigError(error: unknown): boolean {
    return error instanceof Error && error.message === "Supabase is not configured";
}

function describeSupabaseError(error: unknown): string {
    if (error instanceof Error) return error.message;

    const maybeError = error as SupabaseErrorLike;
    return [maybeError.code, maybeError.message, maybeError.details, maybeError.hint]
        .filter(Boolean)
        .join(" - ") || "Unknown Supabase error";
}

function logSupabaseDebug(message: string, details?: Record<string, unknown>) {
    if (!debugSupabase) return;
    console.log(`[supabase-debug] ${message}`, details ?? "");
}

function mapEscrowRow(row: EscrowRow): Escrow {
    return {
        id: row.id,
        escrowPda: row.escrow_pda,
        depositorWallet: row.depositor_wallet,
        receiverWallet: row.receiver_wallet,
        amount: Number(row.amount),
        displayAmount: Number(row.display_amount),
        tokenMint: row.token_mint,
        tokenType: row.token_type,
        description: row.description,
        status: row.status,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        fundedAt: row.funded_at,
        releasedAt: row.released_at,
        txSignature: row.tx_signature,
    };
}

function mapReleaseSessionRow(row: ReleaseSessionRow): ReleaseSession {
    return {
        id: row.id,
        escrowId: row.escrow_id,
        token: row.token,
        status: row.status,
        initiatedBy: row.initiated_by,
        depositorConfirmed: row.depositor_confirmed,
        receiverConfirmed: row.receiver_confirmed,
        depositorConfirmedAt: row.depositor_confirmed_at,
        receiverConfirmedAt: row.receiver_confirmed_at,
        completedAt: row.completed_at,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
    };
}

function amountToBaseUnits(input: CreateEscrowInput): number {
    const decimals = input.tokenType === "SOL" ? 9 : 6;
    return Math.round(input.amount * 10 ** decimals);
}

function shouldUseAnchor(escrow: Escrow | null, id: string): boolean {
    return Boolean(escrow?.escrowPda && isOnChainEscrowId(id));
}

function isOnChainEscrowId(id: string): boolean {
    return /^\d+$/.test(id);
}

export class SupabaseEscrowService implements IEscrowService {
    private readonly anchorFallback = new AnchorEscrowService();

    async createEscrow(input: CreateEscrowInput, wallet: WalletContextState): Promise<Escrow> {
        if (!wallet.publicKey) throw new Error("Wallet not connected");

        const { escrow } = await this.anchorFallback.createEscrowWithWallet(input, wallet);

        try {
            assertSupabaseConfigured();
            logSupabaseDebug("createEscrow insert start", {
                table: "escrows",
                configured: isSupabaseConfigured,
                id: escrow.id,
                escrowPda: escrow.escrowPda,
            });

            await this.upsertEscrowReplica(escrow, { amount: amountToBaseUnits(input) });

            logSupabaseDebug("createEscrow insert success", {
                id: escrow.id,
                status: escrow.status,
            });
            await this.addActivity(escrow.id, "escrow_created", wallet.publicKey.toBase58(), {
                txSignature: escrow.txSignature,
            });
        } catch (error) {
            if (!isSupabaseConfigError(error)) {
                const message = describeSupabaseError(error);
                console.warn("[SupabaseEscrowService] createEscrow replica failed:", message);
            }
        }

        return escrow;
    }

    async getEscrow(id: string): Promise<Escrow | null> {
        try {
            assertSupabaseConfigured();
            const { data, error } = await supabase
                .from("escrows")
                .select("*")
                .eq("id", id)
                .maybeSingle();

            if (error) throw new Error(error.message);
            if (data) return mapEscrowRow(data as EscrowRow);

            const anchorEscrow = await this.anchorFallback.getEscrow(id);
            if (anchorEscrow) await this.upsertEscrowReplica(anchorEscrow);
            return anchorEscrow;
        } catch (error) {
            console.warn("[SupabaseEscrowService] getEscrow fallback:", error);
            return this.anchorFallback.getEscrow(id);
        }
    }

    async listEscrows(walletAddress: string, filters?: EscrowFilters): Promise<Escrow[]> {
        try {
            assertSupabaseConfigured();
            let query = supabase
                .from("escrows")
                .select("*")
                .order("created_at", { ascending: false });

            if (filters?.role === "depositor") {
                query = query.eq("depositor_wallet", walletAddress);
            } else if (filters?.role === "receiver") {
                query = query.eq("receiver_wallet", walletAddress);
            } else {
                query = query.or(`depositor_wallet.eq.${walletAddress},receiver_wallet.eq.${walletAddress}`);
            }

            if (filters?.status) {
                query = query.eq("status", filters.status);
            }

            const { data, error } = await query;
            if (error) throw new Error(error.message);
            const escrows = (data as EscrowRow[]).map(mapEscrowRow);
            const anchorEscrows = await this.anchorFallback.listEscrows(walletAddress, filters);
            const merged = new Map<string, Escrow>();

            for (const escrow of escrows) merged.set(escrow.id, escrow);
            for (const escrow of anchorEscrows) {
                if (!merged.has(escrow.id)) {
                    merged.set(escrow.id, escrow);
                    void this.upsertEscrowReplica(escrow).catch((replicaError) => {
                        console.warn(
                            "[SupabaseEscrowService] listEscrows replica failed:",
                            describeSupabaseError(replicaError)
                        );
                    });
                }
            }

            return Array.from(merged.values()).sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
        } catch (error) {
            console.warn("[SupabaseEscrowService] listEscrows fallback:", error);
            return this.anchorFallback.listEscrows(walletAddress, filters);
        }
    }

    async getActiveReleaseSession(escrow: Escrow): Promise<ReleaseSession | null> {
        try {
            assertSupabaseConfigured();
            const anchorSession = isOnChainEscrowId(escrow.id)
                ? await this.anchorFallback.getActiveReleaseSession(escrow)
                : null;
            if (anchorSession) {
                await this.upsertReleaseSessionReplica(anchorSession);
                return anchorSession;
            }

            const { data, error } = await supabase
                .from("release_sessions")
                .select("*")
                .eq("escrow_id", escrow.id)
                .neq("status", "completed")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw new Error(error.message);
            return data ? mapReleaseSessionRow(data as ReleaseSessionRow) : null;
        } catch (error) {
            console.warn("[SupabaseEscrowService] getActiveReleaseSession fallback:", error);
            return this.anchorFallback.getActiveReleaseSession(escrow);
        }
    }

    async fundEscrow(id: string, wallet: WalletContextState): Promise<{ txSignature: string }> {
        const escrow = await this.getEscrow(id);
        const fundedAt = new Date().toISOString();

        if (shouldUseAnchor(escrow, id)) {
            const result = await this.anchorFallback.fundEscrow(id, wallet);
            await this.replicate("fundEscrow", async () => {
                await this.updateEscrow(id, {
                    status: "funded",
                    funded_at: fundedAt,
                    tx_signature: result.txSignature,
                });
                await this.addActivity(id, "escrow_funded", wallet.publicKey?.toBase58() ?? "", result);
            });
            return result;
        }

        throw new Error("This escrow is not linked to an on-chain escrow account, so it cannot be funded with a wallet signature.");
    }

    async initiateRelease(
        escrowId: string,
        initiatorWalletOrWallet: string | WalletContextState,
        depositorWallet?: string
    ): Promise<ReleaseSession> {
        const initiatorWallet = typeof initiatorWalletOrWallet === "string"
            ? initiatorWalletOrWallet
            : initiatorWalletOrWallet.publicKey?.toBase58() ?? "";
        if (!initiatorWallet) throw new Error("Wallet not connected");

        const escrow = await this.getEscrow(escrowId);
        if (shouldUseAnchor(escrow, escrowId) && typeof initiatorWalletOrWallet !== "string") {
            const session = await this.anchorFallback.initiateRelease(
                escrowId,
                initiatorWalletOrWallet,
                depositorWallet
            );
            await this.replicate("initiateRelease", async () => {
                await this.updateEscrow(escrowId, { status: "release_pending" });
                await this.upsertReleaseSessionReplica(session);
                await this.addActivity(escrowId, "release_initiated", initiatorWallet);
            });
            return session;
        }

        void escrow;
        throw new Error("Release initiation must be signed against an on-chain escrow account.");
    }

    async confirmRelease(
        sessionId: string,
        wallet: WalletContextState,
        role: "depositor" | "receiver"
    ): Promise<void> {
        void sessionId;
        void wallet;
        void role;
        throw new Error("confirmRelease requires escrow context and a wallet signature. Use confirmReleaseWithEscrowId.");
    }

    async confirmReleaseWithEscrowId(
        escrowId: string,
        sessionToken: string,
        wallet: WalletContextState,
        role: "depositor" | "receiver",
        depositorWallet?: string
    ): Promise<{ txSignature: string }> {
        const escrow = await this.getEscrow(escrowId);
        if (shouldUseAnchor(escrow, escrowId) && escrow) {
            const result = await this.anchorFallback.confirmReleaseWithEscrowId(
                escrowId,
                sessionToken,
                wallet,
                role,
                depositorWallet
            );

            const activeSession = await this.anchorFallback.getActiveReleaseSession(escrow);
            await this.replicate("confirmRelease", async () => {
                if (activeSession) await this.upsertReleaseSessionReplica(activeSession);
                await this.addActivity(escrowId, "release_confirmed", wallet.publicKey?.toBase58() ?? "", {
                    role,
                    txSignature: result.txSignature,
                });
            });
            return result;
        }

        throw new Error("Release confirmation must be signed against an on-chain escrow account.");
    }

    async executeRelease(
        sessionId: string,
        wallet?: WalletContextState,
        context?: { escrowId: string; depositorWallet: string }
    ): Promise<{ txSignature: string }> {
        const escrow = context ? await this.getEscrow(context.escrowId) : null;
        if (context && shouldUseAnchor(escrow, context.escrowId)) {
            const result = await this.anchorFallback.executeRelease(sessionId, wallet, context);
            const now = new Date().toISOString();
            await this.replicate("executeRelease", async () => {
                await this.updateReleaseSession(sessionId, {
                    status: "completed",
                    completed_at: now,
                });
                await this.updateEscrow(context.escrowId, {
                    status: "released",
                    released_at: now,
                    tx_signature: result.txSignature,
                });
                await this.addActivity(
                    context.escrowId,
                    "release_completed",
                    wallet?.publicKey?.toBase58() ?? "",
                    result
                );
            });
            return result;
        }

        throw new Error("Release execution must be signed against an on-chain escrow account.");
    }

    async refundEscrow(id: string, wallet: WalletContextState): Promise<{ txSignature: string }> {
        const escrow = await this.getEscrow(id);
        if (shouldUseAnchor(escrow, id)) {
            const result = await this.anchorFallback.refundEscrow(id, wallet);
            await this.replicate("refundEscrow", async () => {
                await this.updateEscrow(id, { status: "refunded", tx_signature: result.txSignature });
                await this.addActivity(id, "escrow_refunded", wallet.publicKey?.toBase58() ?? "", result);
            });
            return result;
        }

        throw new Error("This escrow is not linked to an on-chain escrow account, so it cannot be refunded with a wallet signature.");
    }

    private async upsertEscrowReplica(
        escrow: Escrow,
        overrides: Partial<Record<keyof EscrowRow | "network", unknown>> = {}
    ): Promise<void> {
        if (!isSupabaseConfigured) return;

        const payload = {
            id: escrow.id,
            escrow_pda: escrow.escrowPda,
            depositor_wallet: escrow.depositorWallet,
            receiver_wallet: escrow.receiverWallet,
            amount: escrow.amount,
            display_amount: escrow.displayAmount,
            token_mint: escrow.tokenMint,
            token_type: escrow.tokenType,
            description: escrow.description,
            status: escrow.status,
            expires_at: escrow.expiresAt,
            funded_at: escrow.fundedAt,
            released_at: escrow.releasedAt,
            tx_signature: escrow.txSignature,
            created_at: escrow.createdAt,
            network: SOLANA_NETWORK,
            ...overrides,
        };

        const { error } = await supabase.from("escrows").upsert(payload, { onConflict: "id" });
        if (error) throw error;
    }

    private async upsertReleaseSessionReplica(session: ReleaseSession): Promise<void> {
        if (!isSupabaseConfigured) return;

        const { error } = await supabase.from("release_sessions").upsert({
            id: session.id,
            escrow_id: session.escrowId,
            token: session.token,
            status: session.status,
            initiated_by: session.initiatedBy,
            depositor_confirmed: session.depositorConfirmed,
            receiver_confirmed: session.receiverConfirmed,
            depositor_confirmed_at: session.depositorConfirmedAt,
            receiver_confirmed_at: session.receiverConfirmedAt,
            completed_at: session.completedAt,
            expires_at: session.expiresAt,
            created_at: session.createdAt,
        }, { onConflict: "id" });

        if (error) throw error;
    }

    private async updateEscrow(id: string, updates: Record<string, unknown>): Promise<void> {
        assertSupabaseConfigured();
        const { error } = await supabase.from("escrows").update(updates).eq("id", id);
        if (error) throw new Error(error.message);
    }

    private async updateReleaseSession(id: string, updates: Record<string, unknown>): Promise<void> {
        assertSupabaseConfigured();
        const { error } = await supabase.from("release_sessions").update(updates).eq("id", id);
        if (error) throw new Error(error.message);
    }

    private async replicate(label: string, operation: () => Promise<void>): Promise<void> {
        try {
            await operation();
        } catch (error) {
            if (!isSupabaseConfigError(error)) {
                console.warn(`[SupabaseEscrowService] ${label} replica failed:`, describeSupabaseError(error));
            }
        }
    }

    private async addActivity(
        escrowId: string,
        eventType: ActivityEvent["eventType"],
        actorWallet: string,
        metadata: Record<string, unknown> = {}
    ): Promise<void> {
        if (!isSupabaseConfigured) return;
        const { error } = await supabase.from("activity_events").insert({
            escrow_id: escrowId,
            event_type: eventType,
            actor_wallet: actorWallet,
            metadata,
        });

        if (error) {
            console.warn("[SupabaseEscrowService] activity insert failed:", error.message);
        }
    }
}