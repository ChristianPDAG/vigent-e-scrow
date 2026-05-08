import { supabase } from "@/lib/supabase";
import { RELEASE_SESSION_TTL_MINUTES, USE_MOCK } from "@/lib/constants";
import type { ReleaseSession, ReleaseSessionStatus } from "@/types/release";

function mapRow(row: Record<string, unknown>): ReleaseSession {
  return {
    id: row.id as string,
    escrowId: row.escrow_id as string,
    token: row.token as string,
    status: row.status as ReleaseSessionStatus,
    initiatedBy: row.initiated_by as string,
    depositorConfirmed: row.depositor_confirmed as boolean,
    receiverConfirmed: row.receiver_confirmed as boolean,
    depositorConfirmedAt: row.depositor_confirmed_at as string | null,
    receiverConfirmedAt: row.receiver_confirmed_at as string | null,
    completedAt: row.completed_at as string | null,
    expiresAt: row.expires_at as string,
    createdAt: row.created_at as string,
  };
}

export async function createReleaseSession(
  escrowId: string,
  initiatedBy: string
): Promise<ReleaseSession> {
  if (USE_MOCK) {
    // In mock mode the mock service handles this — this function won't be called
    throw new Error("Use MockEscrowService.initiateRelease in mock mode");
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + RELEASE_SESSION_TTL_MINUTES * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("release_sessions")
    .insert({
      escrow_id: escrowId,
      token,
      status: "pending",
      initiated_by: initiatedBy,
      depositor_confirmed: false,
      receiver_confirmed: false,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function getReleaseSession(sessionId: string): Promise<ReleaseSession | null> {
  if (USE_MOCK) return null;

  const { data, error } = await supabase
    .from("release_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (error) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function getReleaseSessionByToken(token: string): Promise<ReleaseSession | null> {
  if (USE_MOCK) return null;

  const { data, error } = await supabase
    .from("release_sessions")
    .select("*")
    .eq("token", token)
    .single();

  if (error) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function updateReleaseSessionStatus(
  sessionId: string,
  updates: Partial<{
    status: ReleaseSessionStatus;
    depositorConfirmed: boolean;
    receiverConfirmed: boolean;
    depositorConfirmedAt: string;
    receiverConfirmedAt: string;
    completedAt: string;
  }>
): Promise<void> {
  if (USE_MOCK) return;

  const dbUpdates: Record<string, unknown> = {};
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.depositorConfirmed !== undefined)
    dbUpdates.depositor_confirmed = updates.depositorConfirmed;
  if (updates.receiverConfirmed !== undefined)
    dbUpdates.receiver_confirmed = updates.receiverConfirmed;
  if (updates.depositorConfirmedAt !== undefined)
    dbUpdates.depositor_confirmed_at = updates.depositorConfirmedAt;
  if (updates.receiverConfirmedAt !== undefined)
    dbUpdates.receiver_confirmed_at = updates.receiverConfirmedAt;
  if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt;

  const { error } = await supabase
    .from("release_sessions")
    .update(dbUpdates)
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
}
