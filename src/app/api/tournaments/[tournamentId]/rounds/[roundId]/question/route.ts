import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { mapRpcError } from "@/lib/supabase/rpc-errors";

const bodySchema = z.object({
  direction: z.enum(["NEXT", "PREV"]),
});

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

// PATCH /api/tournaments/[tournamentId]/rounds/[roundId]/question
// Advances/retreats the round's current question number. This is plain
// round navigation state, not a score event - moving to the next question
// doesn't score anyone (see migration 0005 comment).
//
// Goes through the advance_round_question RPC (migration 0010) instead of
// updating `rounds` directly: the rounds UPDATE policy is admin-only, so a
// direct update silently failed for SCORE_OPERATOR (R-02). The RPC checks
// the operate_score roles itself and increments atomically, so two
// operators pressing "next" at the same moment advance by two, not one.
export async function PATCH(request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:operate_score")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: currentQuestionNumber, error } = await supabase.rpc("advance_round_question", {
    p_tournament_id: tournamentId,
    p_round_id: roundId,
    p_direction: parsed.data.direction,
  });
  if (error) {
    const mapped = mapRpcError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  return NextResponse.json({ currentQuestionNumber });
}
