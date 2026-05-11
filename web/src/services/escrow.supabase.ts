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
import { RELEASE_SESSION_TTL_MINUTES, SOLANA_NETWORK, USDC_MINT } from "@/lib/constants";
import type { IEscrowService } from "./escrow.service";
import { AnchorEscrowService } from "./escrow.anchor";

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

function assertSupabaseConfigured() {
    if (!isSupabaseConfigured) {
        throw new Error("Supabase is not configured");
    }
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
    return Boolean(escrow?.escrowPda && /^\d+$/.test(id));
}

function nextSessionStatus(
    session: ReleaseSession,
    role: "depositor" | "receiver"
): Pick<
    ReleaseSession,
    | "status"
    | "depositorConfirmed"
    | "receiverConfirmed"
    | "depositorConfirmedAt"
    | "receiverConfirmedAt"
> {
    const now = new Date().toISOString();
    const depositorConfirmed = role === "depositor" ? true : session.depositorConfirmed;
    const receiverConfirmed = role === "receiver" ? true : session.receiverConfirmed;

    return {
        depositorConfirmed,
        receiverConfirmed,
        depositorConfirmedAt: role === "depositor" ? now : session.depositorConfirmedAt,
        receiverConfirmedAt: role === "receiver" ? now : session.receiverConfirmedAt,
        status: depositorConfirmed && receiverConfirmed
            ? "both_confirmed"
            : role === "depositor"
                ? "depositor_confirmed"
                : "receiver_confirmed",
    };
}

export class SupabaseEscrowService implements IEscrowService {
    private readonly anchorFallback = new AnchorEscrowService();

    async createEscrow(input: CreateEscrowInput, wallet: WalletContextState): Promise<Escrow> {
        if (!wallet.publicKey) throw new Error("Wallet not connected");

        try {
            assertSupabaseConfigured();
            const depositorWallet = wallet.publicKey.toBase58();
            const { data, error } = await supabase
                .from("escrows")
                .insert({
                    depositor_wallet: depositorWallet,
                    receiver_wallet: input.receiverWallet,
                    amount: amountToBaseUnits(input),
                    display_amount: input.amount,
                    token_mint: input.tokenType === "SOL" ? null : USDC_MINT,
                    token_type: input.tokenType,
                    description: input.description,
                    status: "created",
                    expires_at: input.expiresAt,
                    network: SOLANA_NETWORK,
                })
                .select()
                .single();

            if (error) throw new Error(error.message);
            const escrow = mapEscrowRow(data as EscrowRow);
            await this.addActivity(escrow.id, "escrow_created", depositorWallet);
            return escrow;
        } catch (error) {
            console.warn("[SupabaseEscrowService] createEscrow fallback:", error);
            return this.anchorFallback.createEscrow(input, wallet);
        }
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
            return data ? mapEscrowRow(data as EscrowRow) : await this.anchorFallback.getEscrow(id);
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
            return escrows.length > 0
                ? escrows
                : await this.anchorFallback.listEscrows(walletAddress, filters);
        } catch (error) {
            console.warn("[SupabaseEscrowService] listEscrows fallback:", error);
            return this.anchorFallback.listEscrows(walletAddress, filters);
        }
    }

    async getActiveReleaseSession(escrow: Escrow): Promise<ReleaseSession | null> {
        try {
            assertSupabaseConfigured();
            const { data, error } = await supabase
                .from("release_sessions")
                .select("*")
                .eq("escrow_id", escrow.id)
                .neq("status", "completed")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw new Error(error.message);
            return data ? mapReleaseSessionRow(data as ReleaseSessionRow) : await this.anchorFallback.getActiveReleaseSession(escrow);
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
            await this.updateEscrow(id, {
                status: "funded",
                funded_at: fundedAt,
                tx_signature: result.txSignature,
            });
            await this.addActivity(id, "escrow_funded", wallet.publicKey?.toBase58() ?? "", result);
            return result;
        }

        const txSignature = `supabase-fund-${Date.now()}`;
        await this.updateEscrow(id, { status: "funded", funded_at: fundedAt, tx_signature: null });
        await this.addActivity(id, "escrow_funded", wallet.publicKey?.toBase58() ?? "", { txSignature });
        return { txSignature };
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
            try {
                const session = await this.anchorFallback.initiateRelease(
                    escrowId,
                    initiatorWalletOrWallet,
                    depositorWallet
                );
                await this.updateEscrow(escrowId, { status: "release_pending" });
                await this.addActivity(escrowId, "release_initiated", initiatorWallet);
                return session;
            } catch (error) {
                console.warn("[SupabaseEscrowService] initiateRelease anchor fallback failed:", error);
            }
        }

        assertSupabaseConfigured();
        if (!escrow) throw new Error("Escrow not found");
        if (escrow.status !== "funded" && escrow.status !== "release_pending") {
            throw new Error("Escrow must be funded to initiate release");
        }

        const expiresAt = new Date(
            Date.now() + RELEASE_SESSION_TTL_MINUTES * 60 * 1000
        ).toISOString();
        const { data, error } = await supabase
            .from("release_sessions")
            .insert({
                escrow_id: escrowId,
                token: crypto.randomUUID(),
                status: "pending",
                initiated_by: initiatorWallet,
                depositor_confirmed: false,
                receiver_confirmed: false,
                expires_at: expiresAt,
            })
            .select()
            .single();

        if (error) throw new Error(error.message);
        await this.updateEscrow(escrowId, { status: "release_pending" });
        await this.addActivity(escrowId, "release_initiated", initiatorWallet);
        return mapReleaseSessionRow(data as ReleaseSessionRow);
    }

    async confirmRelease(
        sessionId: string,
        wallet: WalletContextState,
        role: "depositor" | "receiver"
    ): Promise<void> {
        assertSupabaseConfigured();
        if (!wallet.publicKey) throw new Error("Wallet not connected");
        const session = await this.getSessionById(sessionId);
        if (!session) throw new Error("Session not found");
        await this.confirmSupabaseSession(session, wallet.publicKey.toBase58(), role);
    }

    async confirmReleaseWithEscrowId(
        escrowId: string,
        sessionToken: string,
        wallet: WalletContextState,
        role: "depositor" | "receiver",
        depositorWallet?: string
    ): Promise<{ txSignature: string }> {
        const escrow = await this.getEscrow(escrowId);
        if (shouldUseAnchor(escrow, escrowId)) {
            return this.anchorFallback.confirmReleaseWithEscrowId(
                escrowId,
                sessionToken,
                wallet,
                role,
                depositorWallet
            );
        }

        assertSupabaseConfigured();
        if (!wallet.publicKey) throw new Error("Wallet not connected");
        const { data, error } = await supabase
            .from("release_sessions")
            .select("*")
            .eq("escrow_id", escrowId)
            .eq("token", sessionToken)
            .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) throw new Error("Session not found");
        await this.confirmSupabaseSession(
            mapReleaseSessionRow(data as ReleaseSessionRow),
            wallet.publicKey.toBase58(),
            role
        );
        return { txSignature: `supabase-confirm-${Date.now()}` };
    }

    async executeRelease(
        sessionId: string,
        wallet?: WalletContextState,
        context?: { escrowId: string; depositorWallet: string }
    ): Promise<{ txSignature: string }> {
        const escrow = context ? await this.getEscrow(context.escrowId) : null;
        if (context && shouldUseAnchor(escrow, context.escrowId)) {
            return this.anchorFallback.executeRelease(sessionId, wallet, context);
        }

        assertSupabaseConfigured();
        const session = await this.getSessionById(sessionId);
        if (!session) throw new Error("Session not found");
        if (!session.depositorConfirmed || !session.receiverConfirmed) {
            throw new Error("not fully confirmed");
        }

        const now = new Date().toISOString();
        const txSignature = `supabase-release-${Date.now()}`;
        await this.updateReleaseSession(session.id, {
            status: "completed",
            completed_at: now,
        });
        await this.updateEscrow(session.escrowId, {
            status: "released",
            released_at: now,
            tx_signature: null,
        });
        await this.addActivity(
            session.escrowId,
            "release_completed",
            wallet?.publicKey?.toBase58() ?? session.initiatedBy,
            { txSignature }
        );
        return { txSignature };
    }

    async refundEscrow(id: string, wallet: WalletContextState): Promise<{ txSignature: string }> {
        const escrow = await this.getEscrow(id);
        if (shouldUseAnchor(escrow, id)) {
            const result = await this.anchorFallback.refundEscrow(id, wallet);
            await this.updateEscrow(id, { status: "refunded", tx_signature: result.txSignature });
            await this.addActivity(id, "escrow_refunded", wallet.publicKey?.toBase58() ?? "", result);
            return result;
        }

        const txSignature = `supabase-refund-${Date.now()}`;
        await this.updateEscrow(id, { status: "refunded", tx_signature: null });
        await this.addActivity(id, "escrow_refunded", wallet.publicKey?.toBase58() ?? "", { txSignature });
        return { txSignature };
    }

    private async getSessionById(sessionId: string): Promise<ReleaseSession | null> {
        const { data, error } = await supabase
            .from("release_sessions")
            .select("*")
            .eq("id", sessionId)
            .maybeSingle();

        if (error) throw new Error(error.message);
        return data ? mapReleaseSessionRow(data as ReleaseSessionRow) : null;
    }

    private async confirmSupabaseSession(
        session: ReleaseSession,
        actorWallet: string,
        role: "depositor" | "receiver"
    ): Promise<void> {
        if (new Date(session.expiresAt) < new Date()) throw new Error("Session expired");
        const updates = nextSessionStatus(session, role);
        await this.updateReleaseSession(session.id, {
            status: updates.status,
            depositor_confirmed: updates.depositorConfirmed,
            receiver_confirmed: updates.receiverConfirmed,
            depositor_confirmed_at: updates.depositorConfirmedAt,
            receiver_confirmed_at: updates.receiverConfirmedAt,
        });
        await this.addActivity(session.escrowId, "release_confirmed", actorWallet, { role });
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