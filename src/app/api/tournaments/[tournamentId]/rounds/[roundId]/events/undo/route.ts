import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { recomputeRoundParticipants } from "@/lib/rules/apply-round-events";
import { logAudit } from "@/lib/audit/log";

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

// POST /api/tournaments/[tournamentId]/rounds/[roundId]/events/undo
// Voids the most recent non-voided event for this round (any participant -
// "undo my last action" in a fast-paced buzzer round means the last thing
// that happened, not the last thing for one specific player) and
// recomputes. Voiding, not deleting, keeps the audit trail intact (master
// spec section 29/30).
export async function POST(_request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:operate_score")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: round } = await supabase
    .from("rounds")
    .select("id")
    .eq("id", roundId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (!round) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: lastEvent, error: lastEventError } = await supabase
    .from("score_events")
    .select("id")
    .eq("round_id", roundId)
    .is("voided_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastEventError) return NextResponse.json({ error: lastEventError.message }, { status: 500 });
  if (!lastEvent) {
    return NextResponse.json(
      { error: "no_events", message: "取り消せるイベントがありません" },
      { status: 409 }
    );
  }

  const { error: voidError } = await supabase
    .from("score_events")
    .update({ voided_at: new Date().toISOString(), voided_by: user?.id ?? null })
    .eq("id", lastEvent.id);
  if (voidError) return NextResponse.json({ error: voidError.message }, { status: 500 });

  const result = await recomputeRoundParticipants(supabase, roundId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  await logAudit(supabase, {
    tournamentId,
    actorId: user?.id ?? null,
    action: "score_event.undone",
    summary: "直前の得点イベントを取り消しました",
    roundId,
    metadata: { voidedEventId: lastEvent.id },
  });

  return NextResponse.json({ voidedEventId: lastEvent.id });
}
