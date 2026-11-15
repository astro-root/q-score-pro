import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import {
  STATUS_REASON_MAX_LENGTH,
  canTransition,
  mapStatusChangeError,
  transitionRequiresReason,
} from "@/lib/tournament/status";

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
      "CANCELLED",
    ])
    .optional(),
  // 公開後の訂正(PUBLISHED→RUNNING)と中止(→CANCELLED)で必須。監査ログに残る
  reason: z.string().trim().max(STATUS_REASON_MAX_LENGTH).optional(),
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
  const { status: nextStatus, reason, ...fields } = parsed.data;

  // ステータスの変更は RPC 経由(DBトリガーが遷移の検証と監査ログの記録を行う)。
  // ここでは先に同じ検証をして、画面に分かりやすいメッセージを返す。
  if (nextStatus) {
    if (!can(role, "tournament:publish")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { data: current } = await supabase
      .from("tournaments")
      .select("status")
      .eq("id", tournamentId)
      .single();

    if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (!canTransition(current.status, nextStatus)) {
      return NextResponse.json(
        {
          error: "invalid_status_transition",
          message: `${current.status} から ${nextStatus} への遷移はできません`,
        },
        { status: 409 }
      );
    }

    if (transitionRequiresReason(current.status, nextStatus) && !reason) {
      return NextResponse.json(
        { error: "status_reason_required", message: "訂正・中止には理由の入力が必要です" },
        { status: 400 }
      );
    }

    const { error: statusError } = await supabase.rpc("change_tournament_status", {
      p_tournament_id: tournamentId,
      p_status: nextStatus,
      p_reason: reason ?? null,
    });
    if (statusError) {
      const mapped = mapStatusChangeError(statusError);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
  }

  // 名前・概要など、ステータス以外の項目
  if (Object.keys(fields).length > 0) {
    const { error } = await supabase.from("tournaments").update(fields).eq("id", tournamentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("tournaments")
    .select()
    .eq("id", tournamentId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
