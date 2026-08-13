import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentUser, getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit/log";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum([
    "ADMIN",
    "QUESTION_MANAGER",
    "SCORE_OPERATOR",
    "GRADER",
    "STREAM_OPERATOR",
    "VENUE_STAFF",
    "VIEWER",
  ]),
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
    .from("tournament_members")
    .select("id, user_id, role, created_at, profiles ( display_name, email )")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ members: data });
}

// POST /api/tournaments/[tournamentId]/members
// Invites an *existing* Q-Score Pro user by email as staff. Email-based
// invitations for people without an account yet are a Phase 2 concern
// (requires a magic-link / pending-invite table); for Phase 1 we only
// support attaching an already-registered user.
export async function POST(request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);

  if (!can(role, "tournament:manage_staff")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  // Looking up a user by email requires bypassing the profiles RLS policy
  // (which only allows reading your own row), so this one lookup goes
  // through the service-role client. The actual membership insert below
  // still goes through the caller's own RLS-checked client.
  const serviceClient = createServiceRoleClient();
  const { data: targetProfile, error: lookupError } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("email", parsed.data.email)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!targetProfile) {
    return NextResponse.json(
      { error: "user_not_found", message: "このメールアドレスのユーザーは見つかりませんでした" },
      { status: 404 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournament_members")
    .insert({
      tournament_id: tournamentId,
      user_id: targetProfile.id,
      role: parsed.data.role,
    })
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500; // already a member
    return NextResponse.json({ error: error.message }, { status });
  }

  const actingUser = await getCurrentUser();
  await logAudit(supabase, {
    tournamentId,
    actorId: actingUser?.id ?? null,
    action: "staff.invited",
    summary: `${parsed.data.email} を ${parsed.data.role} としてスタッフに追加しました`,
    metadata: { email: parsed.data.email, role: parsed.data.role },
  });

  return NextResponse.json({ member: data }, { status: 201 });
}
