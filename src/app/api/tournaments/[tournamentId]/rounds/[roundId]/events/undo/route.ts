import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { recomputeRoundParticipants } from "@/lib/rules/apply-round-events";
import { logAudit } from "@/lib/audit/log";
import { mapRpcError } from "@/lib/supabase/rpc-errors";

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

// POST /api/tournaments/[tournamentId]/rounds/[roundId]/events/undo
// Voids the most recent non-voided event for this round (any participant -
// "undo my last action" in a fast-paced buzzer round means the last thing
// that happened, not the last thing for one specific player) and
// recomputes. Voiding, not deleting, keeps the audit trail intact (master
// spec section 29/30).
//
// Picking and voiding the event happens inside the undo_last_score_event RPC
// under a per-round lock, so two simultaneous undos void two different
// events instead of voiding the same one twice.
export async function POST(_request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:operate_score")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const { data: voidedEventId, error: undoError } = await supabase.rpc("undo_last_score_event", {
    p_tournament_id: tournamentId,
    p_round_id: roundId,
  });
  if (undoError) {
    const mapped = mapRpcError(undoError);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
  if (!voidedEventId) {
    return NextResponse.json(
      { error: "no_events", message: "取り消せるイベントがありません" },
      { status: 409 }
    );
  }

  const result = await recomputeRoundParticipants(supabase, roundId);
  if (result.error) {
    return NextResponse.json(
      {
        error: "recompute_failed",
        message: `取り消しは記録されましたが、順位表の更新に失敗しました: ${result.error}`,
        voidedEventId,
      },
      { status: 500 }
    );
  }

  const user = await getCurrentUser();
  await logAudit(supabase, {
    tournamentId,
    actorId: user?.id ?? null,
    action: "score_event.undone",
    summary: "直前の得点イベントを取り消しました",
    roundId,
    metadata: { voidedEventId },
  });

  return NextResponse.json({ voidedEventId });
}
