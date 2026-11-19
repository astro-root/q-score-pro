import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { buildCsv } from "@/lib/csv";
import { loadPaperRound } from "@/lib/paper/load";
import { answersCsvRows, rankingCsvRows, statsCsvRows } from "@/lib/paper/csv-rows";
import { questionStats } from "@/lib/paper/scoring";

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

const TYPES = ["ranking", "answers", "stats"] as const;
type ExportType = (typeof TYPES)[number];

// GET /api/tournaments/[tournamentId]/rounds/[roundId]/paper/export?type=ranking|answers|stats
//   ranking : 順位・得点・通過 (確定値。手入力の点数も含む)
//   answers : 参加者 × 設問の正誤マトリクス
//   stats   : 設問ごとの正答率・誤答率
export async function GET(request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:export_data")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const type = new URL(request.url).searchParams.get("type") as ExportType | null;
  if (!type || !TYPES.includes(type)) {
    return NextResponse.json({ error: "invalid_type", allowed: TYPES }, { status: 400 });
  }

  const supabase = await createClient();
  let data;
  try {
    data = await loadPaperRound(supabase, tournamentId, roundId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "load_failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ids = data.participants.map((p) => p.participantId);
  const rows =
    type === "ranking"
      ? rankingCsvRows(data.participants, data.ranked, data.round.advanceCount)
      : type === "answers"
        ? answersCsvRows(data.participants, data.ranked, data.questions, data.answers)
        : statsCsvRows(questionStats(ids, data.questions, data.answers));

  // 参加者名・所属は応募フォーム由来(外部入力)。buildCsv が数式インジェクションを無害化する。
  return new NextResponse(buildCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="paper-${type}-${roundId}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
