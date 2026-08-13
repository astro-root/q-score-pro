import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { canTransitionRound } from "@/lib/tournament/round-status";
import { ruleConfigSchema } from "@/lib/rules/schema";
import { logAudit } from "@/lib/audit/log";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  advanceCount: z.number().int().positive().nullable().optional(),
  status: z.enum(["NOT_STARTED", "RUNNING", "PAUSED", "FINISHED"]).optional(),
  stageId: z.string().uuid().nullable().optional(),
  ruleConfig: ruleConfigSchema.optional(),
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
    .from("rounds")
    .select("*")
    .eq("id", roundId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ round: data });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_rounds")) {
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

  const supabase = await createClient();

  if (parsed.data.status) {
    const { data: current } = await supabase
      .from("rounds")
      .select("status")
      .eq("id", roundId)
      .eq("tournament_id", tournamentId)
      .single();

    if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (!canTransitionRound(current.status, parsed.data.status)) {
      return NextResponse.json(
        {
          error: "invalid_status_transition",
          message: `${current.status} から ${parsed.data.status} への遷移はできません`,
        },
        { status: 409 }
      );
    }
  }

  const d = parsed.data;
  const { data, error } = await supabase
    .from("rounds")
    .update({
      ...(d.name !== undefined && { name: d.name }),
      ...(d.advanceCount !== undefined && { advance_count: d.advanceCount }),
      ...(d.status !== undefined && { status: d.status }),
      ...(d.stageId !== undefined && { stage_id: d.stageId }),
      ...(d.ruleConfig !== undefined && { rule_config: d.ruleConfig }),
    })
    .eq("id", roundId)
    .eq("tournament_id", tournamentId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (d.status !== undefined) {
    const user = await getCurrentUser();
    await logAudit(supabase, {
      tournamentId,
      actorId: user?.id ?? null,
      action: "round.status_changed",
      summary: `ラウンド「${data.name}」のステータスを ${d.status} に変更しました`,
      roundId,
      metadata: { newStatus: d.status },
    });
  }

  return NextResponse.json({ round: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_rounds")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("rounds")
    .delete()
    .eq("id", roundId)
    .eq("tournament_id", tournamentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
