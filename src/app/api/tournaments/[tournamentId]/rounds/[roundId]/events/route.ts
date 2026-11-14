import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { recomputeRoundParticipants } from "@/lib/rules/apply-round-events";
import { mapRpcError } from "@/lib/supabase/rpc-errors";

const createSchema = z.object({
  participantId: z.string().uuid(),
  type: z.enum(["CORRECT", "WRONG", "THROUGH", "MANUAL_ADJUST", "DISQUALIFY", "REINSTATE"]),
  value: z.number().optional(),
});

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("score_events")
    .select("*, participants ( id, display_name ), actor:actor_id ( display_name )")
    .eq("round_id", roundId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data });
}

// POST records one score event (master spec section 17: 正解/誤答/スルー/
// 加点/減点/失格 - each a one-touch action from the buzzer operator
// screen), then recomputes round_participants from the full event log.
//
// The insert goes through the record_score_event RPC (migration 0010): the
// database itself checks the caller's role (OWNER/ADMIN/SCORE_OPERATOR),
// that the participant belongs to this tournament, and stamps the current
// question number and actor in the same transaction. can() below is only
// there to return a clean 403 early - it is no longer the only gate.
export async function POST(request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:operate_score")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: event, error: recordError } = await supabase.rpc("record_score_event", {
    p_tournament_id: tournamentId,
    p_round_id: roundId,
    p_participant_id: parsed.data.participantId,
    p_event_type: parsed.data.type,
    p_value: parsed.data.value ?? null,
  });
  if (recordError) {
    const mapped = mapRpcError(recordError);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  const result = await recomputeRoundParticipants(supabase, roundId);
  if (result.error) {
    // The event itself IS recorded (append-only log); only the derived
    // scoreboard failed to refresh. Say so, so the operator doesn't re-enter it.
    return NextResponse.json(
      {
        error: "recompute_failed",
        message: `得点は記録されましたが、順位表の更新に失敗しました: ${result.error}`,
        event,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ event }, { status: 201 });
}
