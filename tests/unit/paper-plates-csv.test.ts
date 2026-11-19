import { describe, expect, it } from "vitest";
import { buildCsv } from "@/lib/csv";
import { isPlateColor, normalizePlateColor, plateColorLabel, plateTextColor, PLATE_PALETTE } from "@/lib/paper/plates";
import { answersCsvRows, participantsCsvRows, rankingCsvRows, statsCsvRows } from "@/lib/paper/csv-rows";
import { questionStats, rankParticipants, tallyParticipants, type PaperAnswer, type PaperQuestion } from "@/lib/paper/scoring";

describe("plate colors", () => {
  it("#RRGGBB だけを受け付ける", () => {
    expect(isPlateColor("#dc2626")).toBe(true);
    expect(isPlateColor("#DC2626")).toBe(true);
    for (const bad of ["red", "#fff", "#gggggg", "dc2626", "#dc26261", "", null, undefined, 1]) {
      expect(isPlateColor(bad)).toBe(false);
    }
  });

  it("パレットの色はすべて有効で、名前が引ける", () => {
    for (const p of PLATE_PALETTE) {
      expect(isPlateColor(p.hex)).toBe(true);
      expect(plateColorLabel(p.hex)).toBe(p.name);
    }
    expect(plateColorLabel("#123456")).toBe("#123456");
    expect(plateColorLabel(null)).toBe("");
  });

  it("小文字に正規化する", () => {
    expect(normalizePlateColor("#AABBCC")).toBe("#aabbcc");
  });

  it("明るい色には暗い文字、暗い色には白い文字", () => {
    expect(plateTextColor("#ffffff")).toBe("#111827");
    expect(plateTextColor("#facc15")).toBe("#111827");
    expect(plateTextColor("#111827")).toBe("#ffffff");
    expect(plateTextColor("#2563eb")).toBe("#ffffff");
  });
});

describe("paper CSV rows", () => {
  const Q: PaperQuestion[] = [
    { id: "q2", number: 2, points: 2, label: null },
    { id: "q1", number: 1, points: 1, label: "=cmd" },
  ];
  const people = [
    { participantId: "a", displayName: "=HYPERLINK(\"x\")", affiliation: "大学A", plateColor: "#dc2626" },
    { participantId: "b", displayName: "佐藤", affiliation: null, plateColor: null },
    { participantId: "c", displayName: "未採点太郎", affiliation: null, plateColor: null },
  ];
  const answers: PaperAnswer[] = [
    { participantId: "a", questionId: "q1", isCorrect: true },
    { participantId: "a", questionId: "q2", isCorrect: true },
    { participantId: "b", questionId: "q1", isCorrect: false },
  ];
  const ranked = rankParticipants(
    tallyParticipants(
      people.map((p) => p.participantId),
      Q,
      answers
    ),
    1
  );

  it("順位CSV: 順位順、未採点は末尾、通過とプレート色名が出る", () => {
    const rows = rankingCsvRows(people, ranked, 1);
    expect(rows[0]).toEqual(["順位", "表示名", "所属", "得点", "正答数", "誤答数", "未採点", "通過", "プレート色"]);
    expect(rows[1].slice(0, 2)).toEqual([1, '=HYPERLINK("x")']);
    expect(rows[1][7]).toBe("通過");
    expect(rows[1][8]).toBe("赤");
    expect(rows[2][1]).toBe("佐藤");
    expect(rows[3][0]).toBe("");
  });

  it("正誤CSV: 設問は番号順の列で ○ × 空", () => {
    const rows = answersCsvRows(people, ranked, Q, answers);
    expect(rows[0].slice(6)).toEqual(["Q1", "Q2"]);
    expect(rows[1].slice(6)).toEqual(["○", "○"]);
    expect(rows[2].slice(6)).toEqual(["×", ""]);
    expect(rows[3].slice(6)).toEqual(["", ""]);
  });

  it("統計CSV: 率は % 表記、採点なしは空", () => {
    const rows = statsCsvRows(
      questionStats(
        people.map((p) => p.participantId),
        Q,
        answers
      )
    );
    expect(rows[1].slice(0, 2)).toEqual([1, 1]);
    expect(rows[1][7]).toBe("50%");
    expect(rows[2][7]).toBe("100%");
  });

  it("外部入力(名前・ジャンル)は buildCsv を通すと数式として実行されない", () => {
    const csv = buildCsv([
      ...rankingCsvRows(people, ranked, 1),
      ...statsCsvRows(questionStats(["a"], Q, answers)),
    ]);
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csv).toContain("'=cmd");
    expect(csv).not.toMatch(/(^|,|\r\n)=/);
  });

  it("参加者CSV", () => {
    const rows = participantsCsvRows([
      { displayName: "山田", affiliation: null, status: "ACTIVE", seed: 3, createdAt: "2026-11-01T00:00:00Z" },
    ]);
    expect(rows[1]).toEqual(["山田", "", "ACTIVE", 3, "2026-11-01T00:00:00Z"]);
  });
});
