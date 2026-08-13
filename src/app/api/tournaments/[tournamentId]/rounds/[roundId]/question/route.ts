import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

const bodySchema = z.object({
  direction: z.enum(["NEXT", "PREV"]),
});

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

// PATCH /api/tournaments/[tournamentId]/rounds/[roundId]/question
// Advances/retreats the round's current question number. This is plain
// round navigation state, not a score event - moving to the next question
// doesn't score anyone (see migration 0005 comment).
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

  const { data: round, error: fetchError } = await supabase
    .from("rounds")
    .select("current_question_number")
    .eq("id", roundId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!round) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const next = Math.max(
    1,
    round.current_question_number + (parsed.data.direction === "NEXT" ? 1 : -1)
  );

  const { data, error } = await supabase
    .from("rounds")
    .update({ current_question_number: next })
    .eq("id", roundId)
    .select("current_question_number")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ currentQuestionNumber: data.current_question_number });
}
