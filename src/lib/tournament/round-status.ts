import type { RoundStatus } from "@/types/database";

/**
 * Allowed round status transitions (master spec section 28), mirrored at
 * the DB level by check_round_status_transition() in
 * supabase/migrations/0003_participants_rounds.sql as a last-resort guard.
 * This copy is the primary, testable gate the API route checks first so we
 * can return a clean 409 instead of a raw Postgres trigger error.
 */
export const ALLOWED_ROUND_TRANSITIONS: Record<RoundStatus, RoundStatus[]> = {
  NOT_STARTED: ["RUNNING"],
  RUNNING: ["PAUSED", "FINISHED"],
  PAUSED: ["RUNNING"],
  FINISHED: [],
};

export function canTransitionRound(from: RoundStatus, to: RoundStatus): boolean {
  return ALLOWED_ROUND_TRANSITIONS[from].includes(to);
}
