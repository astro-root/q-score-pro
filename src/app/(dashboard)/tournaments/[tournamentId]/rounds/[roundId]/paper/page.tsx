import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { loadPaperRound } from "@/lib/paper/load";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkButton } from "@/components/ui/Button";
import { PaperWorkspace } from "./paper-workspace";

export default async function PaperRoundPage({
  params,
}: {
  params: Promise<{ tournamentId: string; roundId: string }>;
}) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!role) notFound();
  if (!can(role, "tournament:view")) redirect(`/tournaments/${tournamentId}`);

  const supabase = await createClient();
  let data;
  try {
    data = await loadPaperRound(supabase, tournamentId, roundId);
  } catch (e) {
    return (
      <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
        データを取得できませんでした: {e instanceof Error ? e.message : "不明なエラー"}
        <br />
        マイグレーション 0014 が適用されているか確認してください。
      </p>
    );
  }
  if (!data) notFound();
  if (data.round.roundType !== "PAPER") redirect(`/tournaments/${tournamentId}/rounds/${roundId}`);

  return (
    <div>
      <PageHeader
        eyebrow="ペーパークイズ"
        title={data.round.name}
        description="問題ごとの正誤を入力すると、得点・順位・通過が自動で計算されます。"
        actions={
          <LinkButton href={`/tournaments/${tournamentId}/rounds/${roundId}`} variant="secondary" size="sm">
            ラウンド詳細へ
          </LinkButton>
        }
      />
      <PaperWorkspace
        tournamentId={tournamentId}
        roundId={roundId}
        advanceCount={data.round.advanceCount}
        canManageQuestions={can(role, "tournament:manage_rounds")}
        canGrade={can(role, "tournament:grade_paper_quiz")}
        canExport={can(role, "tournament:export_data")}
        participants={data.participants}
        savedRanked={data.ranked}
        questions={data.questions}
        savedAnswers={data.answers}
      />
    </div>
  );
}
