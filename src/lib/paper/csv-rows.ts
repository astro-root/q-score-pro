/**
 * ペーパークイズの CSV 行を組み立てる(純粋関数)。
 * 文字列化・数式インジェクション対策・BOM は呼び出し側の buildCsv (@/lib/csv) が行う。
 * 参加者名・所属は応募フォーム由来(=外部入力)なので、必ず buildCsv を通すこと。
 */
import type { PaperAnswer, PaperQuestion, QuestionStat, RankedParticipant } from "./scoring";
import { plateColorLabel } from "./plates";

export interface PaperParticipantRow {
  participantId: string;
  displayName: string;
  affiliation: string | null;
  plateColor: string | null;
}

function percent(rate: number | null): string {
  return rate === null ? "" : `${Math.round(rate * 1000) / 10}%`;
}

export function rankingCsvRows(
  participants: readonly PaperParticipantRow[],
  ranked: readonly RankedParticipant[],
  advanceCount: number | null
): unknown[][] {
  const byId = new Map(ranked.map((r) => [r.participantId, r]));
  const rows = participants
    .map((p) => ({ p, r: byId.get(p.participantId) }))
    .sort((a, b) => {
      const ra = a.r?.rank ?? Number.POSITIVE_INFINITY;
      const rb = b.r?.rank ?? Number.POSITIVE_INFINITY;
      return ra - rb || a.p.displayName.localeCompare(b.p.displayName, "ja");
    });

  return [
    ["順位", "表示名", "所属", "得点", "正答数", "誤答数", "未採点", "通過", "プレート色"],
    ...rows.map(({ p, r }) => [
      r?.rank ?? "",
      p.displayName,
      p.affiliation ?? "",
      r?.score ?? "",
      r?.correct ?? "",
      r?.wrong ?? "",
      r?.ungraded ?? "",
      advanceCount === null || !r || r.passed === null ? "" : r.passed ? "通過" : "",
      plateColorLabel(p.plateColor),
    ]),
  ];
}

/** 参加者 × 設問のマトリクス (○ / × / 空=未採点)。 */
export function answersCsvRows(
  participants: readonly PaperParticipantRow[],
  ranked: readonly RankedParticipant[],
  questions: readonly PaperQuestion[],
  answers: readonly PaperAnswer[]
): unknown[][] {
  const qs = [...questions].sort((a, b) => a.number - b.number);
  const result = new Map<string, boolean>();
  for (const a of answers) result.set(`${a.participantId}\u0000${a.questionId}`, a.isCorrect);
  const byId = new Map(ranked.map((r) => [r.participantId, r]));

  const header = [
    "順位",
    "表示名",
    "所属",
    "得点",
    "正答数",
    "誤答数",
    ...qs.map((q) => `Q${q.number}`),
  ];
  const sorted = [...participants].sort((a, b) => {
    const ra = byId.get(a.participantId)?.rank ?? Number.POSITIVE_INFINITY;
    const rb = byId.get(b.participantId)?.rank ?? Number.POSITIVE_INFINITY;
    return ra - rb || a.displayName.localeCompare(b.displayName, "ja");
  });

  return [
    header,
    ...sorted.map((p) => {
      const r = byId.get(p.participantId);
      return [
        r?.rank ?? "",
        p.displayName,
        p.affiliation ?? "",
        r?.score ?? "",
        r?.correct ?? "",
        r?.wrong ?? "",
        ...qs.map((q) => {
          const v = result.get(`${p.participantId}\u0000${q.id}`);
          return v === undefined ? "" : v ? "○" : "×";
        }),
      ];
    }),
  ];
}

export function statsCsvRows(stats: readonly QuestionStat[]): unknown[][] {
  return [
    ["問題番号", "配点", "ジャンル等", "採点済み", "正答数", "誤答数", "未採点", "正答率", "誤答率"],
    ...stats.map((s) => [
      s.number,
      s.points,
      s.label ?? "",
      s.graded,
      s.correct,
      s.wrong,
      s.ungraded,
      percent(s.correctRate),
      percent(s.wrongRate),
    ]),
  ];
}

export function participantsCsvRows(
  rows: readonly {
    displayName: string;
    affiliation: string | null;
    status: string;
    seed: number | null;
    createdAt: string;
  }[]
): unknown[][] {
  return [
    ["表示名", "所属", "ステータス", "シード", "登録日時"],
    ...rows.map((r) => [r.displayName, r.affiliation ?? "", r.status, r.seed ?? "", r.createdAt]),
  ];
}
