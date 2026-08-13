import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

type RouteParams = { params: Promise<{ tournamentId: string }> };

// GET /api/tournaments/[tournamentId]/export
// Full machine-readable backup of everything the master spec section 31
// asks for: tournament info, staff, entries, participants, rounds, groups,
// scores, score events, rankings/advancement (derived, included as-is on
// round_participants), audit logs. Display layouts are Phase 7 and will be
// added to this bundle once they exist.
//
// This is a straightforward "dump everything visible to an admin" export,
// not an incremental/streaming one - acceptable at the "数十〜数百人規模"
// scale the master spec targets (section 36), revisit if a tournament
// grows large enough that this becomes slow.
export async function GET(_request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:export_data")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const [
    tournament,
    members,
    stages,
    rounds,
    roundParticipants,
    participants,
    entries,
    entryFormFields,
    announcements,
    scheduleItems,
    scoreEvents,
    auditLogs,
  ] = await Promise.all([
    supabase.from("tournaments").select("*").eq("id", tournamentId).single(),
    supabase
      .from("tournament_members")
      .select("id, role, created_at, profiles ( display_name, email )")
      .eq("tournament_id", tournamentId),
    supabase.from("stages").select("*").eq("tournament_id", tournamentId),
    supabase.from("rounds").select("*").eq("tournament_id", tournamentId),
    supabase
      .from("round_participants")
      .select("*, rounds!inner ( tournament_id )")
      .eq("rounds.tournament_id", tournamentId),
    supabase.from("participants").select("*").eq("tournament_id", tournamentId),
    supabase.from("entries").select("*").eq("tournament_id", tournamentId),
    supabase.from("entry_form_fields").select("*").eq("tournament_id", tournamentId),
    supabase.from("announcements").select("*").eq("tournament_id", tournamentId),
    supabase.from("schedule_items").select("*").eq("tournament_id", tournamentId),
    supabase
      .from("score_events")
      .select("*, rounds!inner ( tournament_id )")
      .eq("rounds.tournament_id", tournamentId),
    supabase.from("audit_logs").select("*").eq("tournament_id", tournamentId),
  ]);

  const firstError = [
    tournament,
    members,
    stages,
    rounds,
    roundParticipants,
    participants,
    entries,
    entryFormFields,
    announcements,
    scheduleItems,
    scoreEvents,
    auditLogs,
  ].find((r) => r.error);
  if (firstError?.error) {
    return NextResponse.json({ error: firstError.error.message }, { status: 500 });
  }

  const bundle = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    tournament: tournament.data,
    staff: members.data,
    stages: stages.data,
    rounds: rounds.data,
    roundParticipants: roundParticipants.data,
    participants: participants.data,
    entries: entries.data,
    entryFormFields: entryFormFields.data,
    announcements: announcements.data,
    scheduleItems: scheduleItems.data,
    scoreEvents: scoreEvents.data,
    auditLogs: auditLogs.data,
  };

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="q-score-pro-backup-${tournamentId}.json"`,
    },
  });
}
