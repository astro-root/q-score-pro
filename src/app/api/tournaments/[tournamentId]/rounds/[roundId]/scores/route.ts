import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { computeRanking, determineAdvancement } from "@/lib/scoring/ranking";

const submitSchema = z.object({
  scores: z.array(
    z.object({
      participantId: z.string().uuid(),
      score: z.number(),
    })
  ).min(1),
});

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

// PUT /api/tournaments/[tournamentId]/rounds/[roundId]/scores
// Accepts a full or partial set of per-participant scores for a round,
// writes them, then recomputes rank + passed for EVERY participant in the
// round from scratch (not just the ones in this request) - ranking is only
// meaningful relative to the whole field, so a partial recompute would
// silently produce wrong ranks for people not included in this call.
export async function PUT(request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:grade_paper_quiz")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: round, error: roundError } = await supabase
    .from("rounds")
    .select("id, advance_count")
    .eq("id", roundId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 });
  if (!round) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Write the submitted scores in one round trip (upsert on the existing
  // round_id+participant_id row, which must already exist - participants
  // are attached to a round via the /participants endpoint first).
  const { error: writeError } = await supabase.from("round_participants").upsert(
    parsed.data.scores.map((entry) => ({
      round_id: roundId,
      participant_id: entry.participantId,
      score: entry.score,
    })),
    { onConflict: "round_id,participant_id" }
  );
  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 });

  // Recompute ranking + advancement across the whole round in one more
  // round trip each way, regardless of participant count (section 36:
  // avoid per-row round trips at tournament scale).
  const { data: all, error: allError } = await supabase
    .from("round_participants")
    .select("participant_id, score")
    .eq("round_id", roundId);
  if (allError) return NextResponse.json({ error: allError.message }, { status: 500 });

  const scored = (all ?? [])
    .filter((r) => r.score !== null)
    .map((r) => ({ id: r.participant_id, score: r.score as number }));

  const ranked = computeRanking(scored);
  const advancing = round.advance_count ? determineAdvancement(ranked, round.advance_count) : null;

  if (ranked.length > 0) {
    const { error: rankError } = await supabase.from("round_participants").upsert(
      ranked.map((r) => ({
        round_id: roundId,
        participant_id: r.id,
        score: r.score,
        rank: r.rank,
        passed: advancing ? advancing.has(r.id) : null,
      })),
      { onConflict: "round_id,participant_id" }
    );
    if (rankError) return NextResponse.json({ error: rankError.message }, { status: 500 });
  }

  const { data: updated, error: finalError } = await supabase
    .from("round_participants")
    .select("*, participants ( id, display_name, affiliation, status )")
    .eq("round_id", roundId)
    .order("rank", { ascending: true, nullsFirst: false });
  if (finalError) return NextResponse.json({ error: finalError.message }, { status: 500 });

  return NextResponse.json({ roundParticipants: updated });
}
