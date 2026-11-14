import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { evaluateRound, toScored } from "@/lib/rules/engine";
import type { AbstractScoreEvent, RuleConfig } from "@/lib/rules/types";
import { computeRanking, determineAdvancement } from "@/lib/scoring/ranking";

/** apply_round_computation (0010) に渡す1参加者ぶんの行。 */
export interface RoundParticipantRow {
  participant_id: string;
  score: number;
  rank: number | null;
  passed: boolean | null;
  correct_count: number;
  wrong_count: number;
  through_count: number;
  disqualified: boolean;
  won: boolean;
}

/**
 * 純粋関数: ルール設定・(取消されていない)イベント・ラウンドに所属する参加者から、
 * round_participants に書き込む行を導出する。DB には触らない。
 */
export function buildRoundParticipantRows(input: {
  ruleConfig: RuleConfig;
  advanceCount: number | null;
  events: AbstractScoreEvent[];
  attachedParticipantIds: string[];
}): RoundParticipantRow[] {
  const states = evaluateRound(input.ruleConfig, input.events);

  // イベントが1件もない参加者にも行(得点0・カウンタ0)が必要。
  // そうしないと、まだ何も答えていない人が順位表から消えてしまう。
  for (const participantId of input.attachedParticipantIds) {
    if (!states.has(participantId)) {
      states.set(participantId, {
        participantId,
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
  const advancing = input.advanceCount
    ? determineAdvancement(ranked, input.advanceCount)
    : null;
  const rankById = new Map(ranked.map((r) => [r.id, r.rank]));

  return [...states.values()].map((s) => ({
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
}

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_RETRY_DELAY_MS = 15;

export interface RecomputeOptions {
  /** 他の操作との競合で書き込みが拒否(stale)された場合の最大試行回数。 */
  maxAttempts?: number;
  /** 再試行までの待ち時間の基準(ms)。試行回数に比例し、ランダムなゆらぎを加える。 */
  retryDelayMs?: number;
}

/**
 * round_participants (score/rank/passed/correct_count/wrong_count/through_count/
 * disqualified/won) を、そのラウンドの「取消されていない score_events 全件」から
 * 再導出して書き込む。
 *
 * 「イベント記録」「Undo」の両APIルートが必ずここを通るため、2つの経路の
 * 計算ロジックがずれることはない(Undo は特別な処理ではなく、
 * 「1件が取消された状態での再計算」にすぎない。src/lib/rules/engine.ts 参照)。
 *
 * ## 同時操作での整合性 (R-04)
 * 以前は read → 計算 → 全件 upsert を排他なしで行っていたため、2人のオペレーターが
 * ほぼ同時に操作すると、古い計算結果が新しい結果を上書きしうる実装だった。現在は
 * 楽観的排他で解決している:
 *   1. get_round_score_seq で seq(score_events への書き込み回数)を「先に」読む
 *   2. イベント等を読んで計算する
 *   3. apply_round_computation(expected_seq = 1.で読んだ値) で書き込む
 *      → その間に別のイベントが書かれて seq が進んでいれば、DBは書き込みを拒否(false)する
 *   4. 拒否された場合は 1. からやり直す
 * 順序(seq を先に読む)が重要: 逆にすると、古いイベントに新しい seq が
 * 紐づいてしまい、古い計算結果が通ってしまう。
 *
 * 試行回数を使い切った場合は成功扱いで返す。seq が進み続けているということは
 * 他のリクエストがイベントを書き続けており、「最後にイベントを書いたリクエスト」の
 * 再計算は(その後に書き込みがないため)必ず成功し、最終的な状態を正しく反映するため。
 */
export async function recomputeRoundParticipants(
  supabase: SupabaseClient<Database>,
  roundId: string,
  options: RecomputeOptions = {}
): Promise<{ error: string } | { error: null }> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 1. seq を最初に読む(順序は必須。上のコメント参照)
    const { data: seq, error: seqError } = await supabase.rpc("get_round_score_seq", {
      p_round_id: roundId,
    });
    if (seqError) return { error: seqError.message };

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

    const { data: attached, error: attachedError } = await supabase
      .from("round_participants")
      .select("participant_id")
      .eq("round_id", roundId);
    if (attachedError) return { error: attachedError.message };

    const rows = buildRoundParticipantRows({
      ruleConfig: round.rule_config,
      advanceCount: round.advance_count,
      events: (events ?? []).map((e) => ({
        id: e.id,
        participantId: e.participant_id,
        type: e.event_type,
        value: e.value ?? undefined,
      })),
      attachedParticipantIds: (attached ?? []).map((rp) => rp.participant_id),
    });

    if (rows.length === 0) return { error: null };

    // 3. 書き込み。seq が進んでいれば false が返る(何も書かれない)
    const { data: applied, error: applyError } = await supabase.rpc("apply_round_computation", {
      p_round_id: roundId,
      p_expected_seq: seq as number,
      p_rows: rows,
    });
    if (applyError) return { error: applyError.message };
    if (applied) return { error: null };

    // 4. stale: 少し待って最新の状態からやり直す
    if (attempt < maxAttempts && retryDelayMs > 0) {
      const wait = retryDelayMs * attempt * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  return { error: null };
}
