/**
 * Rule engine types (master spec section 15: 汎用ルールエンジン).
 *
 * The whole point of this module is that tournament rules are DATA
 * (a RuleConfig value, stored as jsonb on `rounds.rule_config`), not code.
 * Adding a new tournament format means constructing a new RuleConfig, not
 * writing new branches through the app. The engine (engine.ts) is the one
 * place that interprets this data.
 */

export type WinCondition =
  | { type: "SCORE_TARGET"; targetScore: number } // 得点先取・勝ち抜け
  | { type: "QUESTION_COUNT"; questionCount: number } // 問題数制(ラウンド全体の問題数)
  | { type: "TIME_LIMIT"; timeLimitSeconds: number } // 時間制
  | { type: "OPEN" }; // 制限なし、スタッフが手動でラウンドを終了する

export interface RuleConfig {
  correctPoints: number; // 正解時の得点
  wrongPenalty: number; // 誤答時の減点(正の数。scoreから引かれる)
  throughPenalty: number; // スルー時の得点変動(通常0)
  maxWrongAnswers: number | null; // 誤答回数の上限。nullなら無制限
  disqualifyOnMaxWrong: boolean; // 誤答回数の上限到達で自動失格にするか
  winCondition: WinCondition;
  // 順位点(rank -> 得点)。設定されている場合、ラウンド最終結果は素点ではなく
  // 順位に応じた得点に変換される(複数ラウンド合算方式向け)。
  placementPoints: Record<number, number> | null;
}

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  correctPoints: 10,
  wrongPenalty: 0,
  throughPenalty: 0,
  maxWrongAnswers: null,
  disqualifyOnMaxWrong: false,
  winCondition: { type: "OPEN" },
  placementPoints: null,
};

export type ScoreEventType =
  | "CORRECT"
  | "WRONG"
  | "THROUGH"
  | "MANUAL_ADJUST"
  | "DISQUALIFY"
  | "REINSTATE";

/**
 * An abstract, engine-level score event. This intentionally does NOT match
 * the future DB `score_events` table (Phase 5) column-for-column - it's the
 * minimal shape the rule engine needs to fold over. The Phase 5 persistence
 * layer will map DB rows to this shape before calling the engine, keeping
 * the engine itself free of DB/Realtime concerns (master spec section 35:
 * ルールと表示の分離、同じ理屈でルールとイベント永続化も分離する).
 */
export interface AbstractScoreEvent {
  id: string;
  participantId: string;
  type: ScoreEventType;
  value?: number; // used by MANUAL_ADJUST: signed delta applied to score
}

export interface ParticipantRuleState {
  participantId: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  throughCount: number;
  disqualified: boolean;
  won: boolean; // reached a SCORE_TARGET win condition
}

export function initialParticipantState(participantId: string): ParticipantRuleState {
  return {
    participantId,
    score: 0,
    correctCount: 0,
    wrongCount: 0,
    throughCount: 0,
    disqualified: false,
    won: false,
  };
}
