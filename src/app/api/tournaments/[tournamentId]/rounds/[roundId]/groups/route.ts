import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import {
  applySeparationConstraints,
  assignGroupsRoundRobin,
  assignGroupsSequentialBlocks,
  assignGroupsSnake,
} from "@/lib/scoring/grouping";

const bodySchema = z.object({
  groupCount: z.number().int().positive().max(26), // group labels are A-Z
  method: z.enum(["SNAKE", "ROUND_ROBIN", "SEQUENTIAL_BLOCKS"]).default("SNAKE"),
  // Optional: only assign these participants (e.g. only those who passed
  // the previous round). Defaults to every participant currently in the
  // round, ordered by rank (falls back to join order when unranked).
  participantIds: z.array(z.string().uuid()).optional(),
  separate: z.array(z.array(z.string().uuid()).min(2)).optional(),
});

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_rounds")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: roundParticipants, error } = await supabase
    .from("round_participants")
    .select("participant_id, rank, created_at")
    .eq("round_id", roundId)
    .order("rank", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pool = parsed.data.participantIds
    ? (roundParticipants ?? []).filter((rp) => parsed.data.participantIds!.includes(rp.participant_id))
    : (roundParticipants ?? []);

  const orderedIds = pool.map((rp) => rp.participant_id);
  if (orderedIds.length === 0) {
    return NextResponse.json(
      { error: "no_participants", message: "組分け対象の参加者がいません" },
      { status: 400 }
    );
  }

  let assignment =
    parsed.data.method === "ROUND_ROBIN"
      ? assignGroupsRoundRobin(orderedIds, parsed.data.groupCount)
      : parsed.data.method === "SEQUENTIAL_BLOCKS"
        ? assignGroupsSequentialBlocks(orderedIds, parsed.data.groupCount)
        : assignGroupsSnake(orderedIds, parsed.data.groupCount);

  let unresolved: string[][] = [];
  if (parsed.data.separate && parsed.data.separate.length > 0) {
    const result = applySeparationConstraints(orderedIds, assignment, parsed.data.separate);
    assignment = result.assignment;
    unresolved = result.unresolved;
  }

  const { error: writeError } = await supabase.from("round_participants").upsert(
    orderedIds.map((id) => ({
      round_id: roundId,
      participant_id: id,
      group_label: assignment[id],
    })),
    { onConflict: "round_id,participant_id" }
  );
  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 500 });

  const { data: updated, error: finalError } = await supabase
    .from("round_participants")
    .select("*, participants ( id, display_name, affiliation, status )")
    .eq("round_id", roundId)
    .order("group_label", { ascending: true })
    .order("rank", { ascending: true, nullsFirst: false });
  if (finalError) return NextResponse.json({ error: finalError.message }, { status: 500 });

  return NextResponse.json({ roundParticipants: updated, unresolvedSeparationConstraints: unresolved });
}
