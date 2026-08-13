import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

const itemSchema = z.object({
  label: z.string().min(1).max(200),
  scheduledAt: z.string().datetime().nullable().optional(),
});

const replaceSchema = z.object({
  items: z.array(itemSchema).max(100),
});

type RouteParams = { params: Promise<{ tournamentId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_items")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

// PUT replaces the entire schedule in one call, since reordering is the
// common edit pattern (drag to reorder), not incremental patches.
export async function PUT(request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_cms")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = replaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("schedule_items")
    .delete()
    .eq("tournament_id", tournamentId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (parsed.data.items.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const { data, error: insertError } = await supabase
    .from("schedule_items")
    .insert(
      parsed.data.items.map((item, index) => ({
        tournament_id: tournamentId,
        label: item.label,
        scheduled_at: item.scheduledAt ?? null,
        sort_order: index,
      }))
    )
    .select();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ items: data });
}
