import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

const addSchema = z.object({
  participantIds: z.array(z.string().uuid()).min(1).max(1000),
});

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("round_participants")
    .select("*, participants ( id, display_name, affiliation, status )")
    .eq("round_id", roundId)
    .order("rank", { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ roundParticipants: data });
}

// POST adds participants to a round (entry into that round's competitor
// list). Score/rank/group start out null and are set later via the
// /scores and /groups endpoints.
export async function POST(request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_rounds")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Only attach participants that actually belong to this tournament -
  // otherwise a crafted participantId from another tournament could slip
  // into this round's list (RLS would still block reading their data
  // cross-tournament, but we don't want a dangling/mismatched row at all).
  const { data: validParticipants, error: participantsError } = await supabase
    .from("participants")
    .select("id")
    .eq("tournament_id", tournamentId)
    .in("id", parsed.data.participantIds);
  if (participantsError) {
    return NextResponse.json({ error: participantsError.message }, { status: 500 });
  }

  const validIds = new Set((validParticipants ?? []).map((p) => p.id));
  const rows = parsed.data.participantIds
    .filter((id) => validIds.has(id))
    .map((participantId) => ({ round_id: roundId, participant_id: participantId }));

  if (rows.length === 0) {
    return NextResponse.json({ roundParticipants: [] });
  }

  const { data, error } = await supabase
    .from("round_participants")
    .upsert(rows, { onConflict: "round_id,participant_id", ignoreDuplicates: true })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ roundParticipants: data }, { status: 201 });
}
