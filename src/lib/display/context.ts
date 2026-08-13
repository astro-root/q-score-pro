import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { DisplayDataContext } from "./types";

/**
 * Builds the DisplayDataContext for a given round, from live DB data. This
 * is the one place that bridges "everything else" (tournaments, rounds,
 * round_participants) into the display engine's data shape - the renderer
 * itself never queries the DB directly (see DisplayRenderer.tsx docs).
 */
export async function buildDisplayContext(
  supabase: SupabaseClient<Database>,
  roundId: string
): Promise<DisplayDataContext | null> {
  const { data: round } = await supabase
    .from("rounds")
    .select("name, status, current_question_number, tournament_id")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return null;

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("name, logo_url")
    .eq("id", round.tournament_id)
    .maybeSingle();
  if (!tournament) return null;

  const { data: roundParticipants } = await supabase
    .from("round_participants")
    .select("participant_id, score, rank, correct_count, wrong_count, participants ( display_name )")
    .eq("round_id", roundId);

  return {
    tournament: { name: tournament.name, logoUrl: tournament.logo_url },
    round: {
      name: round.name,
      questionNumber: round.current_question_number,
      status: round.status,
    },
    players: (roundParticipants ?? []).map((rp) => ({
      participantId: rp.participant_id,
      name: (rp.participants as unknown as { display_name: string } | null)?.display_name ?? "-",
      rank: rp.rank,
      score: rp.score ?? 0,
      correctCount: rp.correct_count,
      wrongCount: rp.wrong_count,
    })),
  };
}
