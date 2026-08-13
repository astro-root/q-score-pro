import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { canTransition } from "@/lib/tournament/status";
import { logAudit } from "@/lib/audit/log";

const updateTournamentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  summary: z.string().max(2000).nullable().optional(),
  status: z
    .enum([
      "DRAFT",
      "REGISTRATION_OPEN",
      "REGISTRATION_CLOSED",
      "RUNNING",
      "FINISHED",
      "PUBLISHED",
    ])
    .optional(),
});

type RouteParams = { params: Promise<{ tournamentId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tournaments")
    .select("id, slug, name, status, summary, owner_id, created_at, updated_at")
    .eq("id", tournamentId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ tournament: data });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);

  if (!can(role, "tournament:update_settings")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateTournamentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  if (parsed.data.status) {
    if (!can(role, "tournament:publish")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { data: current } = await supabase
      .from("tournaments")
      .select("status")
      .eq("id", tournamentId)
      .single();

    if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (!canTransition(current.status, parsed.data.status)) {
      return NextResponse.json(
        {
          error: "invalid_status_transition",
          message: `${current.status} から ${parsed.data.status} への遷移はできません`,
        },
        { status: 409 }
      );
    }
  }

  const { data, error } = await supabase
    .from("tournaments")
    .update(parsed.data)
    .eq("id", tournamentId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.data.status) {
    const user = await getCurrentUser();
    await logAudit(supabase, {
      tournamentId,
      actorId: user?.id ?? null,
      action: "tournament.status_changed",
      summary: `大会ステータスを ${parsed.data.status} に変更しました`,
      metadata: { newStatus: parsed.data.status },
    });
  }

  return NextResponse.json({ tournament: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);

  if (!can(role, "tournament:delete")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tournaments").delete().eq("id", tournamentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return new NextResponse(null, { status: 204 });
}
