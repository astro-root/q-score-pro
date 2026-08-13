import type { TournamentMemberRole } from "@/types/database";

/**
 * Every privileged action in Q-Score Pro must be represented here instead of
 * being checked with ad-hoc if/else chains scattered across API routes.
 * This is a data table, not code, so adding a new action or role is a
 * one-line change and stays auditable (see master spec section 15 / 3.3).
 *
 * Backend verification is mandatory: RLS policies in
 * supabase/migrations/0001_init.sql provide the last line of defense, but
 * route handlers should also call `can()` early so we return a clean 403
 * instead of leaking a Postgres RLS error to the client.
 */
export type TournamentAction =
  | "tournament:update_settings"
  | "tournament:manage_cms"
  | "tournament:delete"
  | "tournament:publish"
  | "tournament:manage_staff"
  | "tournament:manage_entries"
  | "tournament:manage_participants"
  | "tournament:manage_rounds"
  | "tournament:manage_questions"
  | "tournament:operate_score"
  | "tournament:grade_paper_quiz"
  | "tournament:manage_stream"
  | "tournament:view_audit_log"
  | "tournament:export_data"
  | "tournament:view";

const ROLE_ACTIONS: Record<TournamentMemberRole, readonly TournamentAction[]> = {
  OWNER: [
    "tournament:update_settings",
    "tournament:manage_cms",
    "tournament:delete",
    "tournament:publish",
    "tournament:manage_staff",
    "tournament:manage_entries",
    "tournament:manage_participants",
    "tournament:manage_rounds",
    "tournament:manage_questions",
    "tournament:operate_score",
    "tournament:grade_paper_quiz",
    "tournament:manage_stream",
    "tournament:view_audit_log",
    "tournament:export_data",
    "tournament:view",
  ],
  ADMIN: [
    "tournament:update_settings",
    "tournament:manage_cms",
    "tournament:publish",
    "tournament:manage_staff",
    "tournament:manage_entries",
    "tournament:manage_participants",
    "tournament:manage_rounds",
    "tournament:manage_questions",
    "tournament:operate_score",
    "tournament:grade_paper_quiz",
    "tournament:manage_stream",
    "tournament:view_audit_log",
    "tournament:export_data",
    "tournament:view",
  ],
  QUESTION_MANAGER: ["tournament:manage_questions", "tournament:view"],
  SCORE_OPERATOR: ["tournament:operate_score", "tournament:view"],
  GRADER: ["tournament:grade_paper_quiz", "tournament:view"],
  STREAM_OPERATOR: ["tournament:manage_stream", "tournament:view"],
  VENUE_STAFF: ["tournament:view"],
  VIEWER: ["tournament:view"],
};

export function can(
  role: TournamentMemberRole | null | undefined,
  action: TournamentAction
): boolean {
  if (!role) return false;
  return ROLE_ACTIONS[role].includes(action);
}

export function actionsFor(role: TournamentMemberRole): readonly TournamentAction[] {
  return ROLE_ACTIONS[role];
}
