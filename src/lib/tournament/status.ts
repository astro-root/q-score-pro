import type { TournamentStatus } from "@/types/database";

/**
 * Allowed status transitions (master spec section 28: 不正な状態遷移を防止する).
 * Kept as a lookup table, not scattered if/else, so it's easy to test and to
 * extend when Phase 4+ introduces round-linked auto-transitions.
 */
export const ALLOWED_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  DRAFT: ["REGISTRATION_OPEN"],
  REGISTRATION_OPEN: ["REGISTRATION_CLOSED", "DRAFT"],
  REGISTRATION_CLOSED: ["RUNNING", "REGISTRATION_OPEN"],
  RUNNING: ["FINISHED"],
  FINISHED: ["PUBLISHED"],
  PUBLISHED: [],
};

export function canTransition(from: TournamentStatus, to: TournamentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
