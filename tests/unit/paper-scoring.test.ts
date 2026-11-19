import { describe, expect, it } from "vitest";
import {
  questionStats,
  rankParticipants,
  tallyParticipants,
  withFallbackScores,
  type PaperAnswer,
  type PaperQuestion,
} from "@/lib/paper/scoring";

const Q: PaperQuestion[] = [
  { id: "q1", number: 1, points: 1, label: null },
  { id: "q2", number: 2, points: 2, label: "科学" },
  { id: "q3", number: 3, points: 3, label: null },
];
const ans = (p: string, q: string, c: boolean): PaperAnswer => ({ participantId: p, questionId: q, isCorrect: c });

describe("tallyParticipants", () => {
  it("正解した設問の配点を合計し、誤答は減点しない", () => {
    const [a] = tallyParticipants(["a"], Q, [ans("a", "q1", true), ans("a", "q2", false), ans("a", "q3", true)]);
    expect(a).toEqual({ participantId: "a", graded: 3, correct: 2, wrong: 1, ungraded: 0, score: 4 });
  });

  it("1件も採点していない参加者は score が null(0点とは区別する)", () => {
    const [a] = tallyParticipants(["a"], Q, []);
    expect(a.score).toBeNull();
    expect(a.ungraded).toBe(3);
  });

  it("全問誤答は 0 点で、未採点(null)ではない", () => {
    const [a] = tallyParticipants(["a"], Q, [ans("a", "q1", false)]);
    expect(a.score).toBe(0);
    expect(a.graded).toBe(1);
    expect(a.ungraded).toBe(2);
  });

  it("存在しない参加者・設問の回答は無視する", () => {
    const [a] = tallyParticipants(["a"], Q, [ans("a", "zzz", true), ans("ghost", "q1", true)]);
    expect(a.score).toBeNull();
  });

  it("同じ(参加者,設問)が複数あれば最後の1件が有効", () => {
    const [a] = tallyParticipants(["a"], Q, [ans("a", "q1", false), ans("a", "q1", true)]);
    expect(a.correct).toBe(1);
    expect(a.score).toBe(1);
  });

  it("配点は小数も扱える", () => {
    const q: PaperQuestion[] = [{ id: "x", number: 1, points: 0.5, label: null }];
    const [a] = tallyParticipants(["a"], q, [ans("a", "x", true)]);
    expect(a.score).toBe(0.5);
  });
});

describe("questionStats", () => {
  const people = ["a", "b", "c", "d"];
  const answers = [
    ans("a", "q1", true),
    ans("b", "q1", true),
    ans("c", "q1", false),
    // d は q1 未採点
    ans("a", "q2", false),
  ];

  it("正答数・誤答数・未採点・率を設問ごとに出す", () => {
    const [s1, s2, s3] = questionStats(people, Q, answers);
    expect(s1).toMatchObject({ number: 1, graded: 3, correct: 2, wrong: 1, ungraded: 1 });
    expect(s1.correctRate).toBeCloseTo(2 / 3);
    expect(s1.wrongRate).toBeCloseTo(1 / 3);
    expect(s2).toMatchObject({ graded: 1, correct: 0, wrong: 1, ungraded: 3, correctRate: 0 });
    expect(s3).toMatchObject({ graded: 0, ungraded: 4, correctRate: null, wrongRate: null });
  });

  it("設問は番号順に並ぶ", () => {
    const shuffled = [Q[2], Q[0], Q[1]];
    expect(questionStats(people, shuffled, []).map((s) => s.number)).toEqual([1, 2, 3]);
  });

  it("率の分母は『採点済み人数』(未採点を誤答扱いしない)", () => {
    const [s1] = questionStats(["a", "b"], Q, [ans("a", "q1", true)]);
    expect(s1.correctRate).toBe(1);
  });
});

describe("rankParticipants", () => {
  const tally = (id: string, score: number | null) => ({
    participantId: id,
    graded: score === null ? 0 : 1,
    correct: 0,
    wrong: 0,
    ungraded: 0,
    score,
  });

  it("標準競争順位 (1,2,2,4)", () => {
    const r = rankParticipants([tally("a", 10), tally("b", 8), tally("c", 8), tally("d", 5)], null);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 2, 4]);
  });

  it("通過人数の境界が同点なら同点者は全員通過", () => {
    const r = rankParticipants([tally("a", 10), tally("b", 8), tally("c", 8), tally("d", 5)], 2);
    expect(r.map((x) => x.passed)).toEqual([true, true, true, false]);
  });

  it("通過人数が参加者数より多くても全員通過になる", () => {
    const r = rankParticipants([tally("a", 3), tally("b", 1)], 10);
    expect(r.map((x) => x.passed)).toEqual([true, true]);
  });

  it("未採点の参加者は rank / passed が null で、順位にも影響しない", () => {
    const r = rankParticipants([tally("a", 3), tally("n", null), tally("b", 1)], 1);
    expect(r.find((x) => x.participantId === "n")).toMatchObject({ rank: null, passed: null });
    expect(r.find((x) => x.participantId === "b")).toMatchObject({ rank: 2, passed: false });
  });

  it("通過人数が未設定なら passed は null", () => {
    const r = rankParticipants([tally("a", 3)], null);
    expect(r[0].passed).toBeNull();
  });

  it("全員同点なら全員1位・全員通過", () => {
    const r = rankParticipants([tally("a", 5), tally("b", 5), tally("c", 5)], 1);
    expect(r.every((x) => x.rank === 1 && x.passed === true)).toBe(true);
  });
});

describe("withFallbackScores (手入力の点数を仮順位から消さない)", () => {
  it("回答がない参加者だけ、保存済みの点数で補う", () => {
    const tallies = tallyParticipants(["manual", "graded", "empty"], Q, [ans("graded", "q1", true)]);
    const filled = withFallbackScores(
      tallies,
      new Map<string, number | null>([
        ["manual", 7],
        ["graded", 99],
        ["empty", null],
      ])
    );
    expect(filled.map((t) => t.score)).toEqual([7, 1, null]);
  });

  it("補った点数で順位に参加する", () => {
    const tallies = tallyParticipants(["manual", "graded"], Q, [ans("graded", "q1", true)]);
    const ranked = rankParticipants(withFallbackScores(tallies, new Map([["manual", 7]])), 1);
    expect(ranked.find((r) => r.participantId === "manual")).toMatchObject({ rank: 1, passed: true });
    expect(ranked.find((r) => r.participantId === "graded")).toMatchObject({ rank: 2, passed: false });
  });

  it("採点済みの人の点数は保存済みの値で上書きしない", () => {
    const tallies = tallyParticipants(["a"], Q, [ans("a", "q2", true)]);
    expect(withFallbackScores(tallies, new Map([["a", 50]]))[0].score).toBe(2);
  });
});
