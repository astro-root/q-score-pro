import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { EMPTY_LAYOUT } from "@/lib/display/types";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  duplicateFromId: z.string().uuid().optional(),
});

type RouteParams = { params: Promise<{ tournamentId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("display_layouts")
    .select("id, name, created_at, updated_at")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ layouts: data });
}

export async function POST(request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_cms")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const user = await getCurrentUser();

  let data = EMPTY_LAYOUT;
  if (parsed.data.duplicateFromId) {
    const { data: source } = await supabase
      .from("display_layouts")
      .select("data")
      .eq("id", parsed.data.duplicateFromId)
      .eq("tournament_id", tournamentId)
      .maybeSingle();
    if (source) data = source.data;
  }

  const { data: layout, error } = await supabase
    .from("display_layouts")
    .insert({
      tournament_id: tournamentId,
      name: parsed.data.name,
      data,
      created_by: user?.id ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ layout }, { status: 201 });
}
