import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

const importSchema = z.object({
  entryIds: z.array(z.string().uuid()).min(1).max(1000),
});

type RouteParams = { params: Promise<{ tournamentId: string }> };

// POST /api/tournaments/[tournamentId]/participants/import-from-entries
// Screens selected entries into managed participant records (master spec
// section 8/11: エントリー情報から参加者を確定する運用フロー). Entries
// already imported (entry_id already used) are skipped, not duplicated.
export async function POST(request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_participants")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: entries, error: entriesError } = await supabase
    .from("entries")
    .select("id, display_name, affiliation")
    .eq("tournament_id", tournamentId)
    .in("id", parsed.data.entryIds);
  if (entriesError) return NextResponse.json({ error: entriesError.message }, { status: 500 });

  const { data: existing, error: existingError } = await supabase
    .from("participants")
    .select("entry_id")
    .eq("tournament_id", tournamentId)
    .in("entry_id", parsed.data.entryIds);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const alreadyImported = new Set((existing ?? []).map((p) => p.entry_id));
  const toInsert = (entries ?? [])
    .filter((e) => !alreadyImported.has(e.id))
    .map((e) => ({
      tournament_id: tournamentId,
      entry_id: e.id,
      display_name: e.display_name,
      affiliation: e.affiliation,
    }));

  if (toInsert.length === 0) {
    return NextResponse.json({ participants: [], skipped: parsed.data.entryIds.length });
  }

  const { data, error } = await supabase.from("participants").insert(toInsert).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { participants: data, skipped: parsed.data.entryIds.length - toInsert.length },
    { status: 201 }
  );
}
