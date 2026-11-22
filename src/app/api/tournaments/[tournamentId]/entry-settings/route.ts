import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

const iso = z.string().datetime({ offset: true });

const settingsSchema = z
  .object({
    opensAt: iso.nullable(),
    closesAt: iso.nullable(),
    autoRegister: z.boolean(),
  })
  .refine((v) => !v.opensAt || !v.closesAt || Date.parse(v.opensAt) < Date.parse(v.closesAt), {
    message: "締切は開始より後の日時にしてください",
    path: ["closesAt"],
  });

type RouteParams = { params: Promise<{ tournamentId: string }> };

// PUT /api/tournaments/[tournamentId]/entry-settings
// 受付期間(null = 制限なし)と、応募時の参加者自動追加の設定。
// 受付の可否は DB の RLS (0015) が期間まで含めて強制する。ここは設定の保存だけ。
export async function PUT(request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_cms")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: "invalid_input", message: first?.message ?? "入力内容を確認してください" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .update({
      entry_starts_at: parsed.data.opensAt,
      entry_ends_at: parsed.data.closesAt,
      entry_auto_register: parsed.data.autoRegister,
    })
    .eq("id", tournamentId)
    .select("entry_starts_at, entry_ends_at, entry_auto_register")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // RLS で更新が弾かれた場合も、行が見えない場合も 0 行になる
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    opensAt: data.entry_starts_at,
    closesAt: data.entry_ends_at,
    autoRegister: data.entry_auto_register,
  });
}
