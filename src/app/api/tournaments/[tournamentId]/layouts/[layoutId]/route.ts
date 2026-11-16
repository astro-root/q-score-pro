import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { layoutDataSchema } from "@/lib/display/layout-io";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  data: layoutDataSchema.optional(),
});

type RouteParams = { params: Promise<{ tournamentId: string; layoutId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { tournamentId, layoutId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("display_layouts")
    .select("*")
    .eq("id", layoutId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ layout: data });
}

// PATCH handles both renaming and full save (data = the whole
// DisplayLayoutData, replaced wholesale - matches how the editor works,
// see master spec section 24). The data is validated by the same schema the
// JSON import uses (src/lib/display/layout-io.ts). JSON import itself goes
// through POST /layouts/import, which also sanitizes foreign data.
export async function PATCH(request: Request, { params }: RouteParams) {
  const { tournamentId, layoutId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_cms")) {
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
    .from("display_layouts")
    .update({
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.data !== undefined && { data: parsed.data.data }),
    })
    .eq("id", layoutId)
    .eq("tournament_id", tournamentId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ layout: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { tournamentId, layoutId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_cms")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("display_layouts")
    .delete()
    .eq("id", layoutId)
    .eq("tournament_id", tournamentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
