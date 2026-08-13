import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { ruleConfigSchema } from "@/lib/rules/schema";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  roundType: z.enum(["PAPER", "BUZZER"]).default("PAPER"),
  advanceCount: z.number().int().positive().nullable().optional(),
  stageId: z.string().uuid().nullable().optional(),
  ruleConfig: ruleConfigSchema.optional(),
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
    .from("rounds")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rounds: data });
}

export async function POST(request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_rounds")) {
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

  const { count } = await supabase
    .from("rounds")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId);

  const { data, error } = await supabase
    .from("rounds")
    .insert({
      tournament_id: tournamentId,
      name: parsed.data.name,
      round_type: parsed.data.roundType,
      advance_count: parsed.data.advanceCount ?? null,
      stage_id: parsed.data.stageId ?? null,
      sort_order: count ?? 0,
      ...(parsed.data.ruleConfig && { rule_config: parsed.data.ruleConfig }),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ round: data }, { status: 201 });
}
