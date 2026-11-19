import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { mapRpcError } from "@/lib/supabase/rpc-errors";
import { loadPaperRound } from "@/lib/paper/load";

const bodySchema = z.object({
  answers: z
    .array(
      z.object({
        participantId: z.string().uuid(),
        questionId: z.string().uuid(),
        // true=正解 / false=誤答 / null=未採点に戻す(キーは必須)
        isCorrect: z.boolean().nullable(),
      })
    )
    .min(1)
    .max(20000),
});

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

// PUT /api/tournaments/[tournamentId]/rounds/[roundId]/paper/answers
// 正誤をまとめて保存。得点・順位・通過の再計算までDB側(RPC)が1トランザクションで行うので、
// 複数の採点者が同時に保存しても順位が食い違わない。保存後の確定値を返す。
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

  // 別大会のラウンドを指定されても RPC に渡さない(RPC側でも権限は検証される)。
  const { data: round, error: roundError } = await supabase
    .from("rounds")
    .select("id")
    .eq("id", roundId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 });
  if (!round) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error } = await supabase.rpc("submit_paper_answers", {
    p_round_id: roundId,
    p_answers: parsed.data.answers.map((a) => ({
      participant_id: a.participantId,
      question_id: a.questionId,
      is_correct: a.isCorrect,
    })),
  });
  if (error) {
    const mapped = mapRpcError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  try {
    const data = await loadPaperRound(supabase, tournamentId, roundId);
    return NextResponse.json({ ranked: data?.ranked ?? [], answers: data?.answers ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "load_failed" }, { status: 500 });
  }
}
