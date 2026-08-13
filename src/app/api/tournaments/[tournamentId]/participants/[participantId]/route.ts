import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit/log";

const updateSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  affiliation: z.string().max(200).nullable().optional(),
  status: z.enum(["ACTIVE", "DISQUALIFIED", "ABSENT", "WITHDRAWN"]).optional(),
  seed: z.number().int().positive().nullable().optional(),
});

type RouteParams = { params: Promise<{ tournamentId: string; participantId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { tournamentId, participantId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_participants")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("participants")
    .update({
      ...(d.displayName !== undefined && { display_name: d.displayName }),
      ...(d.affiliation !== undefined && { affiliation: d.affiliation }),
      ...(d.status !== undefined && { status: d.status }),
      ...(d.seed !== undefined && { seed: d.seed }),
    })
    .eq("id", participantId)
    .eq("tournament_id", tournamentId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (d.status !== undefined) {
    const user = await getCurrentUser();
    await logAudit(supabase, {
      tournamentId,
      actorId: user?.id ?? null,
      action: "participant.status_changed",
      summary: `${data.display_name} のステータスを ${d.status} に変更しました`,
      participantId,
      metadata: { newStatus: d.status },
    });
  }

  return NextResponse.json({ participant: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { tournamentId, participantId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_participants")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("participants")
    .delete()
    .eq("id", participantId)
    .eq("tournament_id", tournamentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
