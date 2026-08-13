import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { OperatorScreen } from "./operator-screen";

export default async function OperatePage({
  params,
}: {
  params: Promise<{ tournamentId: string; roundId: string }>;
}) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);

  if (!role) notFound();
  if (!can(role, "tournament:operate_score")) {
    redirect(`/tournaments/${tournamentId}/rounds/${roundId}`);
  }

  const supabase = await createClient();

  const { data: round } = await supabase
    .from("rounds")
    .select("id, current_question_number")
    .eq("id", roundId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (!round) notFound();

  const { data: roundParticipants } = await supabase
    .from("round_participants")
    .select("*, participants ( id, display_name )")
    .eq("round_id", roundId);

  const sorted = (roundParticipants ?? []).sort((a, b) =>
    (a.participants?.display_name ?? "").localeCompare(b.participants?.display_name ?? "")
  );

  return (
    <OperatorScreen
      tournamentId={tournamentId}
      roundId={roundId}
      initialParticipants={sorted}
      initialQuestionNumber={round.current_question_number}
    />
  );
}
