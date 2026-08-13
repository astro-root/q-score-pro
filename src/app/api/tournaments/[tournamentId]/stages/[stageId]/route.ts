import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

type RouteParams = { params: Promise<{ tournamentId: string; stageId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { tournamentId, stageId } = await params;
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
  const { data, error } = await supabase
    .from("stages")
    .update({
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.sortOrder !== undefined && { sort_order: parsed.data.sortOrder }),
    })
    .eq("id", stageId)
    .eq("tournament_id", tournamentId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stage: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { tournamentId, stageId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_rounds")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("stages")
    .delete()
    .eq("id", stageId)
    .eq("tournament_id", tournamentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
