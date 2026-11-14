import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit/log";
import {
  ASSIGNABLE_ROLES,
  MEMBER_CHANGE_MESSAGES,
  checkMemberChange,
  mapMemberDbError,
} from "@/lib/tournament/member-rules";

const updateSchema = z.object({ role: z.enum(ASSIGNABLE_ROLES) });

type RouteParams = { params: Promise<{ tournamentId: string; memberId: string }> };

type TargetRow = {
  id: string;
  user_id: string;
  role: import("@/types/database").TournamentMemberRole;
  profiles: { display_name: string; email: string } | null;
};

async function loadTarget(tournamentId: string, memberId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournament_members")
    .select("id, user_id, role, profiles ( display_name, email )")
    .eq("id", memberId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  return { supabase, target: data as unknown as TargetRow | null, error };
}

function label(target: TargetRow): string {
  return target.profiles?.display_name || target.profiles?.email || "スタッフ";
}

// PATCH /api/tournaments/[tournamentId]/members/[memberId]  { role }
// スタッフのロールを変更する (R-06)。OWNER と自分自身は対象外。
export async function PATCH(request: Request, { params }: RouteParams) {
  const { tournamentId, memberId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_staff")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", message: "付与できないロールが指定されました" },
      { status: 400 }
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { supabase, target, error: loadError } = await loadTarget(tournamentId, memberId);
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!target) {
    return NextResponse.json(
      { error: "not_found", message: "対象のスタッフが見つかりません" },
      { status: 404 }
    );
  }

  const violation = checkMemberChange({
    actorUserId: user.id,
    target: { userId: target.user_id, role: target.role },
    newRole: parsed.data.role,
  });
  if (violation) {
    return NextResponse.json(
      { error: violation, message: MEMBER_CHANGE_MESSAGES[violation] },
      { status: violation === "role_not_assignable" ? 400 : 403 }
    );
  }

  if (target.role === parsed.data.role) {
    return NextResponse.json({ member: { id: target.id, role: target.role } });
  }

  const { data: updated, error } = await supabase
    .from("tournament_members")
    .update({ role: parsed.data.role })
    .eq("id", memberId)
    .eq("tournament_id", tournamentId)
    .select("id, user_id, role")
    .maybeSingle();

  if (error) {
    const mapped = mapMemberDbError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
  // RLS に弾かれた場合はエラーにならず 0 行更新になる。成功扱いにしない
  if (!updated) {
    return NextResponse.json(
      { error: "forbidden", message: "この操作を行う権限がありません" },
      { status: 403 }
    );
  }

  await logAudit(supabase, {
    tournamentId,
    actorId: user.id,
    action: "member.role_changed",
    summary: `${label(target)} のロールを ${target.role} から ${parsed.data.role} に変更しました`,
    metadata: { memberId, userId: target.user_id, from: target.role, to: parsed.data.role },
  });

  return NextResponse.json({ member: updated });
}

// DELETE /api/tournaments/[tournamentId]/members/[memberId]
// スタッフを大会から外す (R-06)。OWNER と自分自身は対象外。
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { tournamentId, memberId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_staff")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { supabase, target, error: loadError } = await loadTarget(tournamentId, memberId);
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!target) {
    return NextResponse.json(
      { error: "not_found", message: "対象のスタッフが見つかりません" },
      { status: 404 }
    );
  }

  const violation = checkMemberChange({
    actorUserId: user.id,
    target: { userId: target.user_id, role: target.role },
  });
  if (violation) {
    return NextResponse.json(
      { error: violation, message: MEMBER_CHANGE_MESSAGES[violation] },
      { status: 403 }
    );
  }

  const { data: deleted, error } = await supabase
    .from("tournament_members")
    .delete()
    .eq("id", memberId)
    .eq("tournament_id", tournamentId)
    .select("id")
    .maybeSingle();

  if (error) {
    const mapped = mapMemberDbError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
  if (!deleted) {
    return NextResponse.json(
      { error: "forbidden", message: "この操作を行う権限がありません" },
      { status: 403 }
    );
  }

  await logAudit(supabase, {
    tournamentId,
    actorId: user.id,
    action: "member.removed",
    summary: `${label(target)}(${target.role})をスタッフから外しました`,
    metadata: { memberId, userId: target.user_id, role: target.role },
  });

  return NextResponse.json({ ok: true });
}
