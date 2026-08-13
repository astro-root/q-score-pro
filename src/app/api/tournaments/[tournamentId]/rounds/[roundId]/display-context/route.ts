import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { buildDisplayContext } from "@/lib/display/context";

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

// GET /api/tournaments/[tournamentId]/rounds/[roundId]/display-context
// Returns the live DisplayDataContext for a round, for the layout editor's
// preview. Staff-only for now; Phase 8 will add a public/OBS variant scoped
// to a specific published layout rather than opening this route itself to
// the public.
export async function GET(_request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const context = await buildDisplayContext(supabase, roundId);
  if (!context) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ context });
}
