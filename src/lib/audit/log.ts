import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Writes one audit_logs row. Called from API routes right after a
 * successful write, using the same request-scoped, RLS-checked Supabase
 * client the route already has - never a service-role client, so the
 * audit_logs_insert_staff_self policy (actor_id must be auth.uid()) is a
 * real guarantee, not just convention.
 *
 * Failures here are logged to the server console but deliberately do NOT
 * fail the parent request - a missing audit entry is bad, but it must
 * never be the reason a legitimate tournament operation (e.g. disqualifying
 * a participant mid-round) gets rolled back or rejected.
 */
export async function logAudit(
  supabase: SupabaseClient<Database>,
  entry: {
    tournamentId: string;
    actorId: string | null;
    action: string;
    summary: string;
    roundId?: string | null;
    participantId?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    tournament_id: entry.tournamentId,
    actor_id: entry.actorId,
    action: entry.action,
    summary: entry.summary,
    round_id: entry.roundId ?? null,
    participant_id: entry.participantId ?? null,
    metadata: entry.metadata ?? {},
  });

  if (error) {
    console.error("[audit] failed to write audit log entry:", entry.action, error.message);
  }
}
