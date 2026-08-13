import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { evaluateRound, toScored } from "@/lib/rules/engine";
import type { AbstractScoreEvent } from "@/lib/rules/types";
import { computeRanking, determineAdvancement } from "@/lib/scoring/ranking";

/**
 * Re-derives round_participants (score/rank/passed/correct_count/
 * wrong_count/through_count/disqualified/won) from the full, non-voided
 * score_events log for a round, then writes the result in one upsert.
 *
 * This is the single choke point both the "record an event" and "undo an
 * event" API routes call through, so the two code paths can never drift:
 * undo is not a special case with its own scoring logic, it's just "recompute
 * with one more event voided" (see src/lib/rules/engine.ts module docs).
 */
export async function recomputeRoundParticipants(
  supabase: SupabaseClient<Database>,
  roundId: string
): Promise<{ error: string } | { error: null }> {
  const { data: round, error: roundError } = await supabase
    .from("rounds")
    .select("rule_config, advance_count")
    .eq("id", roundId)
    .maybeSingle();
  if (roundError) return { error: roundError.message };
  if (!round) return { error: "round not found" };

  const { data: events, error: eventsError } = await supabase
    .from("score_events")
    .select("id, participant_id, event_type, value")
    .eq("round_id", roundId)
    .is("voided_at", null)
    .order("created_at", { ascending: true });
  if (eventsError) return { error: eventsError.message };

  const abstractEvents: AbstractScoreEvent[] = (events ?? []).map((e) => ({
    id: e.id,
    participantId: e.participant_id,
    type: e.event_type,
    value: e.value ?? undefined,
  }));

  const states = evaluateRound(round.rule_config, abstractEvents);

  // Participants with zero events still need a row (score 0, all counters
  // 0) if they're already attached to the round - otherwise someone who
  // hasn't answered anything yet would vanish from ranking entirely.
  const { data: attached, error: attachedError } = await supabase
    .from("round_participants")
    .select("participant_id")
    .eq("round_id", roundId);
  if (attachedError) return { error: attachedError.message };

  for (const rp of attached ?? []) {
    if (!states.has(rp.participant_id)) {
      states.set(rp.participant_id, {
        participantId: rp.participant_id,
        score: 0,
        correctCount: 0,
        wrongCount: 0,
        throughCount: 0,
        disqualified: false,
        won: false,
      });
    }
  }

  const ranked = computeRanking(toScored(states));
  const advancing = round.advance_count ? determineAdvancement(ranked, round.advance_count) : null;
  const rankById = new Map(ranked.map((r) => [r.id, r.rank]));

  const rows = [...states.values()].map((s) => ({
    round_id: roundId,
    participant_id: s.participantId,
    score: s.score,
    rank: rankById.get(s.participantId) ?? null,
    passed: s.disqualified ? false : advancing ? advancing.has(s.participantId) : null,
    correct_count: s.correctCount,
    wrong_count: s.wrongCount,
    through_count: s.throughCount,
    disqualified: s.disqualified,
    won: s.won,
  }));

  if (rows.length === 0) return { error: null };

  const { error: writeError } = await supabase
    .from("round_participants")
    .upsert(rows, { onConflict: "round_id,participant_id" });
  if (writeError) return { error: writeError.message };

  return { error: null };
}
