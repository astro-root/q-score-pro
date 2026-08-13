/**
 * Rule engine: pure functions that fold a chronological list of
 * AbstractScoreEvents into per-participant state, according to a
 * RuleConfig. No DB, no React, no Supabase - fully unit-testable
 * (master spec section 40: ルールエンジンテスト).
 *
 * Architectural note (feeds directly into Phase 5/6): because state is
 * always DERIVED from the full event list rather than mutated in place,
 * "undo" is just "recompute with the last event removed", and "correct a
 * past mistake" is "recompute with one event edited/removed". This is the
 * property master spec section 16 asks for explicitly: 現在の得点はイベン
 * トから再計算できる構造を基本とする。See rule-engine.test.ts for a test
 * that exercises exactly this Undo scenario.
 */
import type { AbstractScoreEvent, ParticipantRuleState, RuleConfig } from "./types";
import { initialParticipantState } from "./types";

function applyEvent(
  config: RuleConfig,
  state: ParticipantRuleState,
  event: AbstractScoreEvent
): ParticipantRuleState {
  switch (event.type) {
    case "CORRECT": {
      const score = state.score + config.correctPoints;
      const won = config.winCondition.type === "SCORE_TARGET" && score >= config.winCondition.targetScore;
      return { ...state, score, correctCount: state.correctCount + 1, won: state.won || won };
    }
    case "WRONG": {
      const wrongCount = state.wrongCount + 1;
      const disqualified =
        state.disqualified ||
        (config.disqualifyOnMaxWrong &&
          config.maxWrongAnswers !== null &&
          wrongCount >= config.maxWrongAnswers);
      return {
        ...state,
        score: state.score - config.wrongPenalty,
        wrongCount,
        disqualified,
      };
    }
    case "THROUGH":
      return {
        ...state,
        score: state.score + config.throughPenalty,
        throughCount: state.throughCount + 1,
      };
    case "MANUAL_ADJUST":
      return { ...state, score: state.score + (event.value ?? 0) };
    case "DISQUALIFY":
      return { ...state, disqualified: true };
    case "REINSTATE":
      return { ...state, disqualified: false };
    default: {
      const _exhaustive: never = event.type;
      return _exhaustive;
    }
  }
}

/**
 * Folds the full chronological event log into a final state per
 * participant. Events for a disqualified participant are still recorded in
 * their counters (correctCount/wrongCount keep incrementing) but no longer
 * change eligibility beyond what DISQUALIFY/REINSTATE explicitly say -
 * scoring after disqualification is intentionally still applied (a DQ'd
 * player's raw score is still meaningful for record-keeping / manual
 * review), it's `disqualified` + `passed` downstream that keeps them out of
 * advancement, not a frozen score.
 */
export function evaluateRound(
  config: RuleConfig,
  events: readonly AbstractScoreEvent[]
): Map<string, ParticipantRuleState> {
  const states = new Map<string, ParticipantRuleState>();

  for (const event of events) {
    const current = states.get(event.participantId) ?? initialParticipantState(event.participantId);
    states.set(event.participantId, applyEvent(config, current, event));
  }

  return states;
}

/**
 * Converts final round states into the { id, score } shape ranking.ts
 * expects. Disqualified participants are excluded from ranking entirely
 * (master spec: 失格 removes a participant from contention, unlike a low
 * score which just ranks them low).
 */
export function toScored(
  states: Map<string, ParticipantRuleState>
): { id: string; score: number }[] {
  return [...states.values()]
    .filter((s) => !s.disqualified)
    .map((s) => ({ id: s.participantId, score: s.score }));
}

/**
 * Applies 順位点 (placement points) conversion: given already-ranked
 * results, replaces each participant's raw score with the configured
 * points for their rank. Falls back to the raw score for any rank beyond
 * the configured table (e.g. a 5-person table used with 8 participants).
 * Used for 複数ラウンド合算 tournaments that score by placement rather
 * than raw points.
 */
export function applyPlacementPoints(
  ranked: { id: string; score: number; rank: number }[],
  placementPoints: Record<number, number>
): { id: string; score: number }[] {
  return ranked.map((r) => ({
    id: r.id,
    score: placementPoints[r.rank] ?? r.score,
  }));
}

/**
 * 複数ラウンド合算: sums scores for the same participant across several
 * already-scored rounds (e.g. combine placement-point results from
 * multiple heats). Participants absent from a given round are treated as
 * contributing 0 for that round, not excluded from the total.
 */
export function combineRoundScores(
  roundScores: { id: string; score: number }[][]
): { id: string; score: number }[] {
  const totals = new Map<string, number>();
  for (const round of roundScores) {
    for (const { id, score } of round) {
      totals.set(id, (totals.get(id) ?? 0) + score);
    }
  }
  return [...totals.entries()].map(([id, score]) => ({ id, score }));
}
