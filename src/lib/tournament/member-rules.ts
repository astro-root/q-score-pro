import type { TournamentMemberRole } from "@/types/database";

/**
 * スタッフ(tournament_members)の変更ルール (R-06)。
 *
 * 権限そのもの(manage_staff を持つか)は ROLE_ACTIONS / can() が判定する。
 * ここは「manage_staff を持つ人が、誰に何をしてよいか」の業務ルール。
 * DB 側は 0011 のトリガーが OWNER 関連だけを同じ内容で強制する(二重化)。
 */
export const ASSIGNABLE_ROLES = [
  "ADMIN",
  "QUESTION_MANAGER",
  "SCORE_OPERATOR",
  "GRADER",
  "STREAM_OPERATOR",
  "VENUE_STAFF",
  "VIEWER",
] as const satisfies readonly TournamentMemberRole[];

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export type MemberChangeError =
  | "target_is_owner"
  | "cannot_change_self"
  | "role_not_assignable";

export interface MemberChangeInput {
  actorUserId: string;
  target: { userId: string; role: TournamentMemberRole };
  /** ロール変更のときだけ指定する。削除のときは省略 */
  newRole?: TournamentMemberRole;
}

export const MEMBER_CHANGE_MESSAGES: Record<MemberChangeError, string> = {
  target_is_owner: "大会の作成者(OWNER)の権限は変更・削除できません",
  cannot_change_self: "自分自身の権限の変更・削除はできません。他の管理者に依頼してください",
  role_not_assignable: "そのロールは付与できません",
};

export function checkMemberChange(input: MemberChangeInput): MemberChangeError | null {
  if (input.target.role === "OWNER") return "target_is_owner";
  if (input.target.userId === input.actorUserId) return "cannot_change_self";
  if (
    input.newRole !== undefined &&
    !(ASSIGNABLE_ROLES as readonly string[]).includes(input.newRole)
  ) {
    return "role_not_assignable";
  }
  return null;
}

export function mapMemberDbError(error: { message: string; code?: string | null }): {
  status: number;
  body: { error: string; message: string };
} {
  if (error.message.includes("owner_")) {
    return {
      status: 403,
      body: { error: "target_is_owner", message: MEMBER_CHANGE_MESSAGES.target_is_owner },
    };
  }
  if (error.code === "42501") {
    return {
      status: 403,
      body: { error: "forbidden", message: "この操作を行う権限がありません" },
    };
  }
  return { status: 500, body: { error: "internal_error", message: error.message } };
}
