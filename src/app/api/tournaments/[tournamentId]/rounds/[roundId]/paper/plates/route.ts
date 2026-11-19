import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { isPlateColor, normalizePlateColor } from "@/lib/paper/plates";

const bodySchema = z.object({
  assignments: z
    .array(
      z.object({
        participantId: z.string().uuid(),
        // null = 色の指定を外す
        color: z
          .string()
          .refine(isPlateColor, { message: "色は #RRGGBB 形式で指定してください" })
          .nullable(),
      })
    )
    .min(1)
    .max(2000),
});

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

// PUT /api/tournaments/[tournamentId]/rounds/[roundId]/paper/plates
// 参加者ごとのプレート色を設定する(ラウンド単位)。
// 色ごとにまとめて UPDATE するので、参加者数ではなく色の数だけDBに往復する。
export async function PUT(request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:grade_paper_quiz")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: round, error: roundError } = await supabase
    .from("rounds")
    .select("id")
    .eq("id", roundId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 });
  if (!round) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 同じ参加者が複数あれば最後の指定を採用
  const finalByParticipant = new Map<string, string | null>();
  for (const a of parsed.data.assignments) {
    finalByParticipant.set(a.participantId, a.color === null ? null : normalizePlateColor(a.color));
  }
  const groups = new Map<string | null, string[]>();
  for (const [participantId, color] of finalByParticipant) {
    const list = groups.get(color) ?? [];
    list.push(participantId);
    groups.set(color, list);
  }

  let updated = 0;
  for (const [color, ids] of groups) {
    const { data, error } = await supabase
      .from("round_participants")
      .update({ plate_color: color })
      .eq("round_id", roundId)
      .in("participant_id", ids)
      .select("participant_id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated += data?.length ?? 0;
  }

  return NextResponse.json({ updated });
}
