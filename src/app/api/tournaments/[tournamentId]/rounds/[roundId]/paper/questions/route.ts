import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { mapRpcError } from "@/lib/supabase/rpc-errors";

const bodySchema = z
  .object({
    questions: z
      .array(
        z.object({
          number: z.number().int().min(1).max(1000),
          points: z.number().min(0).max(1000),
          label: z.string().trim().max(100).nullable().optional(),
        })
      )
      .max(500),
    // 送られなかった設問を削除してよいか。削除すると、その設問の正誤も消える。
    allowDelete: z.boolean().optional(),
  })
  .refine((v) => new Set(v.questions.map((q) => q.number)).size === v.questions.length, {
    message: "問題番号が重複しています",
    path: ["questions"],
  });

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

// PUT /api/tournaments/[tournamentId]/rounds/[roundId]/paper/questions
// 設問の一覧(番号・配点・ジャンル)を、送られた内容に揃える。
// 既存の番号は更新、新しい番号は追加。送られなかった番号は allowDelete が true のときだけ削除する
// (削除は正誤データも消すため、既定では 409 で止めて件数を返す)。
export async function PUT(request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_rounds")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { questions, allowDelete } = parsed.data;

  const supabase = await createClient();
  const { data: round, error: roundError } = await supabase
    .from("rounds")
    .select("id, round_type")
    .eq("id", roundId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 });
  if (!round) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (round.round_type !== "PAPER") {
    return NextResponse.json({ error: "not_paper_round" }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("paper_questions")
    .select("id, number")
    .eq("round_id", roundId);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const keep = new Set(questions.map((q) => q.number));
  const removing = (existing ?? []).filter((q) => !keep.has(q.number));

  if (removing.length > 0 && !allowDelete) {
    const { count } = await supabase
      .from("paper_answers")
      .select("id", { count: "exact", head: true })
      .in("question_id", removing.map((q) => q.id));
    const numbers = removing.map((q) => q.number).sort((a, b) => a - b);
    return NextResponse.json(
      {
        error: "would_delete_questions",
        message: `問題 ${numbers.join(", ")} を削除します。これらの正誤データ(${count ?? 0}件)も消えます。`,
        numbers,
        answerCount: count ?? 0,
      },
      { status: 409 }
    );
  }

  if (questions.length > 0) {
    const { error: upsertError } = await supabase.from("paper_questions").upsert(
      questions.map((q) => ({
        round_id: roundId,
        number: q.number,
        points: q.points,
        label: q.label?.trim() ? q.label.trim() : null,
      })),
      { onConflict: "round_id,number" }
    );
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  if (removing.length > 0) {
    const { error: deleteError } = await supabase
      .from("paper_questions")
      .delete()
      .eq("round_id", roundId)
      .in("id", removing.map((q) => q.id));
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // 配点の変更・設問の削除は得点に響く。確定値をまとめて更新する。
  const { error: recomputeError } = await supabase.rpc("recompute_paper_round", {
    p_round_id: roundId,
  });
  if (recomputeError) {
    const mapped = mapRpcError(recomputeError);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  const { data: updated, error: finalError } = await supabase
    .from("paper_questions")
    .select("id, number, points, label")
    .eq("round_id", roundId)
    .order("number", { ascending: true });
  if (finalError) return NextResponse.json({ error: finalError.message }, { status: 500 });

  return NextResponse.json({ questions: updated });
}
