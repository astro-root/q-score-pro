import type { TournamentStatus } from "@/types/database";

/**
 * Allowed status transitions (master spec section 28: 不正な状態遷移を防止する).
 * Kept as a lookup table, not scattered if/else, so it's easy to test and to
 * extend when Phase 4+ introduces round-linked auto-transitions.
 *
 * DB側にも同じ遷移表がある (supabase/migrations/0013 の
 * tournament_status_transition_allowed)。tests/unit/tournament-status.test.ts が
 * 両者の一致を検証するので、片方だけ変えないこと。
 *
 * - PUBLISHED → RUNNING は「公開後の訂正」。理由が必須で、監査ログに残る。
 * - CANCELLED(中止)にできるのは、既に公開されていた状態(受付中〜開催中)だけ。
 *   下書きは公開されたことがないので、中止ではなく削除する。理由が必須。
 * - CANCELLED は終端状態(元に戻せない)。
 */
export const ALLOWED_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  DRAFT: ["REGISTRATION_OPEN"],
  REGISTRATION_OPEN: ["REGISTRATION_CLOSED", "DRAFT", "CANCELLED"],
  REGISTRATION_CLOSED: ["RUNNING", "REGISTRATION_OPEN", "CANCELLED"],
  RUNNING: ["FINISHED", "CANCELLED"],
  FINISHED: ["PUBLISHED"],
  PUBLISHED: ["RUNNING"],
  CANCELLED: [],
};

export function canTransition(from: TournamentStatus, to: TournamentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** 訂正(公開結果の取り下げ)と中止は、理由の記録が必須 */
export function transitionRequiresReason(from: TournamentStatus, to: TournamentStatus): boolean {
  return from === "PUBLISHED" || to === "CANCELLED";
}

/** 通常の「次へ進める」遷移(画面の主ボタン)。訂正・中止・巻き戻しは含まない */
export const NEXT_STATUS: Record<TournamentStatus, TournamentStatus | null> = {
  DRAFT: "REGISTRATION_OPEN",
  REGISTRATION_OPEN: "REGISTRATION_CLOSED",
  REGISTRATION_CLOSED: "RUNNING",
  RUNNING: "FINISHED",
  FINISHED: "PUBLISHED",
  PUBLISHED: null,
  CANCELLED: null,
};

export const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = {
  DRAFT: "下書き",
  REGISTRATION_OPEN: "エントリー受付中",
  REGISTRATION_CLOSED: "エントリー締切",
  RUNNING: "開催中",
  FINISHED: "終了",
  PUBLISHED: "結果公開",
  CANCELLED: "中止",
};

export const STATUS_REASON_MAX_LENGTH = 500;

/**
 * change_tournament_status RPC / ステータストリガーのエラーを HTTP に対応づける。
 *   22023 invalid_status_transition : 許可されていない遷移 (409)
 *   22023 status_reason_required    : 訂正・中止に理由がない (400)
 *   P0002 tournament_not_found      : 大会がない、または更新権限がない (404)
 */
export function mapStatusChangeError(error: { message: string; code?: string | null }): {
  status: number;
  body: { error: string; message: string };
} {
  if (error.message.includes("invalid_status_transition")) {
    return {
      status: 409,
      body: { error: "invalid_status_transition", message: "その状態への変更はできません" },
    };
  }
  if (error.message.includes("status_reason_required")) {
    return {
      status: 400,
      body: { error: "status_reason_required", message: "訂正・中止には理由の入力が必要です" },
    };
  }
  if (error.code === "P0002") {
    return {
      status: 404,
      body: { error: "not_found", message: "大会が見つからないか、変更する権限がありません" },
    };
  }
  return { status: 500, body: { error: "internal_error", message: error.message } };
}
