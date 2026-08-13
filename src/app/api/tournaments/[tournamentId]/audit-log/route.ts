import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

type RouteParams = { params: Promise<{ tournamentId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:view_audit_log")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const roundId = url.searchParams.get("roundId");
  const participantId = url.searchParams.get("participantId");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("*, actor:actor_id ( display_name ), rounds ( name ), participants ( display_name )")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (roundId) query = query.eq("round_id", roundId);
  if (participantId) query = query.eq("participant_id", participantId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data });
}
