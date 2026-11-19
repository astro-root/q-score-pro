/**
 * ペーパークイズの集計(純粋関数)。
 *
 * DB側の paper_recompute_round (0014) と同じ規則を TypeScript で表したもの。
 * 画面では「保存前の仮順位」の表示に使い、確定値は常にサーバー(RPC)の結果を使う。
 *
 * 規則:
 * - 得点 = 正解した設問の配点の合計。誤答・未採点は 0 点(減点なし)。
 * - 1件も採点していない参加者は「未採点」: 得点・順位は null。
 * - 順位は標準競争順位 (1,2,2,4)。通過は境界順位の同点者を全員通過 (ranking.ts)。
 */
import { computeRanking, determineAdvancement } from "@/lib/scoring/ranking";

export interface PaperQuestion {
  id: string;
  number: number;
  points: number;
  label: string | null;
}

export interface PaperAnswer {
  participantId: string;
  questionId: string;
  isCorrect: boolean;
}

export interface ParticipantTally {
  participantId: string;
  /** 採点済みの設問数 */
  graded: number;
  correct: number;
  wrong: number;
  ungraded: number;
  /** 1件も採点していなければ null */
  score: number | null;
}

export interface QuestionStat {
  questionId: string;
  number: number;
  points: number;
  label: string | null;
  /** 採点済みの人数 */
  graded: number;
  correct: number;
  wrong: number;
  /** 採点対象の参加者のうち、この設問が未採点の人数 */
  ungraded: number;
  /** correct / graded。graded が 0 なら null */
  correctRate: number | null;
  wrongRate: number | null;
}

export interface RankedParticipant extends ParticipantTally {
  rank: number | null;
  passed: boolean | null;
}

/** 参加者・設問に存在しない回答(削除済みなど)を除き、(参加者,設問) ごとに最後の1件だけ残す。 */
function normalizeAnswers(
  participantIds: readonly string[],
  questions: readonly PaperQuestion[],
  answers: readonly PaperAnswer[]
): Map<string, boolean> {
  const pset = new Set(participantIds);
  const qset = new Set(questions.map((q) => q.id));
  const map = new Map<string, boolean>();
  for (const a of answers) {
    if (pset.has(a.participantId) && qset.has(a.questionId)) {
      map.set(`${a.participantId}\u0000${a.questionId}`, a.isCorrect);
    }
  }
  return map;
}

export function tallyParticipants(
  participantIds: readonly string[],
  questions: readonly PaperQuestion[],
  answers: readonly PaperAnswer[]
): ParticipantTally[] {
  const normalized = normalizeAnswers(participantIds, questions, answers);
  return participantIds.map((participantId) => {
    let graded = 0;
    let correct = 0;
    let wrong = 0;
    let score = 0;
    for (const q of questions) {
      const v = normalized.get(`${participantId}\u0000${q.id}`);
      if (v === undefined) continue;
      graded++;
      if (v) {
        correct++;
        score += q.points;
      } else {
        wrong++;
      }
    }
    return {
      participantId,
      graded,
      correct,
      wrong,
      ungraded: questions.length - graded,
      score: graded === 0 ? null : score,
    };
  });
}

export function questionStats(
  participantIds: readonly string[],
  questions: readonly PaperQuestion[],
  answers: readonly PaperAnswer[]
): QuestionStat[] {
  const normalized = normalizeAnswers(participantIds, questions, answers);
  return [...questions]
    .sort((a, b) => a.number - b.number)
    .map((q) => {
      let correct = 0;
      let wrong = 0;
      for (const pid of participantIds) {
        const v = normalized.get(`${pid}\u0000${q.id}`);
        if (v === undefined) continue;
        if (v) correct++;
        else wrong++;
      }
      const graded = correct + wrong;
      return {
        questionId: q.id,
        number: q.number,
        points: q.points,
        label: q.label,
        graded,
        correct,
        wrong,
        ungraded: participantIds.length - graded,
        correctRate: graded === 0 ? null : correct / graded,
        wrongRate: graded === 0 ? null : wrong / graded,
      };
    });
}

/**
 * 回答が1件もない参加者(graded = 0)の得点を、保存済みの値で補う。
 * DB側は「回答がない参加者の score は触らない」ので(手入力の点数を温存するため)、
 * 保存前の仮順位もそれに合わせる。これがないと、手入力のみの人が仮順位から消える。
 */
export function withFallbackScores(
  tallies: readonly ParticipantTally[],
  fallback: ReadonlyMap<string, number | null>
): ParticipantTally[] {
  return tallies.map((t) =>
    t.graded === 0 && t.score === null ? { ...t, score: fallback.get(t.participantId) ?? null } : t
  );
}

/** 集計 + 順位 + 通過。未採点の参加者は rank / passed が null。 */
export function rankParticipants(
  tallies: readonly ParticipantTally[],
  advanceCount: number | null
): RankedParticipant[] {
  const scored = tallies
    .filter((t): t is ParticipantTally & { score: number } => t.score !== null)
    .map((t) => ({ id: t.participantId, score: t.score }));
  const ranked = computeRanking(scored);
  const rankById = new Map(ranked.map((r) => [r.id, r.rank]));
  const advancing = advanceCount && advanceCount > 0 ? determineAdvancement(ranked, advanceCount) : null;

  return tallies.map((t) => {
    const rank = rankById.get(t.participantId) ?? null;
    return {
      ...t,
      rank,
      passed: rank === null || advancing === null ? null : advancing.has(t.participantId),
    };
  });
}
