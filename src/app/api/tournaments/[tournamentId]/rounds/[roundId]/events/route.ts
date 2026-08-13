import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { recomputeRoundParticipants } from "@/lib/rules/apply-round-events";

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
  const user = await getCurrentUser();

  const { data: round } = await supabase
    .from("rounds")
    .select("current_question_number")
    .eq("id", roundId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (!round) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: event, error: insertError } = await supabase
    .from("score_events")
    .insert({
      round_id: roundId,
      participant_id: parsed.data.participantId,
      event_type: parsed.data.type,
      value: parsed.data.value ?? null,
      question_number: round.current_question_number,
      actor_id: user?.id ?? null,
    })
    .select()
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const result = await recomputeRoundParticipants(supabase, roundId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ event }, { status: 201 });
}
