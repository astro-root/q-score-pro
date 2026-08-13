import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { RoundDetail } from "./round-detail";

export default async function RoundDetailPage({
  params,
}: {
  params: Promise<{ tournamentId: string; roundId: string }>;
}) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);

  if (!role) notFound();
  if (!can(role, "tournament:view")) {
    redirect(`/tournaments/${tournamentId}`);
  }

  const supabase = await createClient();

  const { data: round } = await supabase
    .from("rounds")
    .select("*")
    .eq("id", roundId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (!round) notFound();

  const [{ data: roundParticipants }, { data: allParticipants }] = await Promise.all([
    supabase
      .from("round_participants")
      .select("*, participants ( id, display_name, affiliation, status )")
      .eq("round_id", roundId),
    supabase
      .from("participants")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true }),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">{round.name}</h1>
      <p className="mb-6 text-sm text-slate-500">
        {round.round_type === "PAPER" ? "ペーパークイズ" : "早押しクイズ"}
        {round.advance_count ? ` ・ 通過人数 ${round.advance_count}名` : ""}
      </p>

      <RoundDetail
        tournamentId={tournamentId}
        round={round}
        initialRoundParticipants={roundParticipants ?? []}
        allParticipants={allParticipants ?? []}
        canManageRounds={can(role, "tournament:manage_rounds")}
        canGradePaperQuiz={can(role, "tournament:grade_paper_quiz")}
        canOperateScore={can(role, "tournament:operate_score")}
      />
    </div>
  );
}
