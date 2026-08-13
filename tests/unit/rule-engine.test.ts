import { describe, expect, it } from "vitest";
import { computeRanking } from "@/lib/scoring/ranking";
import {
  applyPlacementPoints,
  combineRoundScores,
  evaluateRound,
  toScored,
} from "@/lib/rules/engine";
import { DEFAULT_RULE_CONFIG, type AbstractScoreEvent, type RuleConfig } from "@/lib/rules/types";

function ev(
  id: string,
  participantId: string,
  type: AbstractScoreEvent["type"],
  value?: number
): AbstractScoreEvent {
  return { id, participantId, type, value };
}

describe("evaluateRound: basic scoring", () => {
  it("awards correctPoints on CORRECT", () => {
    const config: RuleConfig = { ...DEFAULT_RULE_CONFIG, correctPoints: 10 };
    const states = evaluateRound(config, [ev("1", "p1", "CORRECT")]);
    expect(states.get("p1")?.score).toBe(10);
    expect(states.get("p1")?.correctCount).toBe(1);
  });

  it("subtracts wrongPenalty on WRONG", () => {
    const config: RuleConfig = { ...DEFAULT_RULE_CONFIG, correctPoints: 10, wrongPenalty: 5 };
    const states = evaluateRound(config, [ev("1", "p1", "WRONG")]);
    expect(states.get("p1")?.score).toBe(-5);
    expect(states.get("p1")?.wrongCount).toBe(1);
  });

  it("accumulates multiple wrong answers", () => {
    const config: RuleConfig = { ...DEFAULT_RULE_CONFIG, wrongPenalty: 5 };
    const states = evaluateRound(config, [
      ev("1", "p1", "WRONG"),
      ev("2", "p1", "WRONG"),
      ev("3", "p1", "WRONG"),
    ]);
    expect(states.get("p1")?.wrongCount).toBe(3);
    expect(states.get("p1")?.score).toBe(-15);
  });

  it("applies throughPenalty (usually 0) on THROUGH without counting as correct or wrong", () => {
    const config: RuleConfig = { ...DEFAULT_RULE_CONFIG, throughPenalty: 0 };
    const states = evaluateRound(config, [ev("1", "p1", "THROUGH")]);
    expect(states.get("p1")?.throughCount).toBe(1);
    expect(states.get("p1")?.correctCount).toBe(0);
    expect(states.get("p1")?.wrongCount).toBe(0);
    expect(states.get("p1")?.score).toBe(0);
  });

  it("keeps separate running totals per participant", () => {
    const config: RuleConfig = { ...DEFAULT_RULE_CONFIG, correctPoints: 10, wrongPenalty: 5 };
    const states = evaluateRound(config, [
      ev("1", "p1", "CORRECT"),
      ev("2", "p2", "WRONG"),
      ev("3", "p1", "CORRECT"),
    ]);
    expect(states.get("p1")?.score).toBe(20);
    expect(states.get("p2")?.score).toBe(-5);
  });
});

describe("evaluateRound: disqualification", () => {
  it("auto-disqualifies once maxWrongAnswers is reached when disqualifyOnMaxWrong is true", () => {
    const config: RuleConfig = {
      ...DEFAULT_RULE_CONFIG,
      maxWrongAnswers: 3,
      disqualifyOnMaxWrong: true,
    };
    const states = evaluateRound(config, [
      ev("1", "p1", "WRONG"),
      ev("2", "p1", "WRONG"),
      ev("3", "p1", "WRONG"),
    ]);
    expect(states.get("p1")?.disqualified).toBe(true);
  });

  it("does not disqualify below the threshold", () => {
    const config: RuleConfig = {
      ...DEFAULT_RULE_CONFIG,
      maxWrongAnswers: 3,
      disqualifyOnMaxWrong: true,
    };
    const states = evaluateRound(config, [ev("1", "p1", "WRONG"), ev("2", "p1", "WRONG")]);
    expect(states.get("p1")?.disqualified).toBe(false);
  });

  it("does not auto-disqualify when disqualifyOnMaxWrong is false", () => {
    const config: RuleConfig = {
      ...DEFAULT_RULE_CONFIG,
      maxWrongAnswers: 1,
      disqualifyOnMaxWrong: false,
    };
    const states = evaluateRound(config, [ev("1", "p1", "WRONG"), ev("2", "p1", "WRONG")]);
    expect(states.get("p1")?.disqualified).toBe(false);
  });

  it("supports explicit staff disqualification and reinstatement", () => {
    const states1 = evaluateRound(DEFAULT_RULE_CONFIG, [ev("1", "p1", "DISQUALIFY")]);
    expect(states1.get("p1")?.disqualified).toBe(true);

    const states2 = evaluateRound(DEFAULT_RULE_CONFIG, [
      ev("1", "p1", "DISQUALIFY"),
      ev("2", "p1", "REINSTATE"),
    ]);
    expect(states2.get("p1")?.disqualified).toBe(false);
  });

  it("excludes disqualified participants from toScored ranking input", () => {
    const config: RuleConfig = { ...DEFAULT_RULE_CONFIG, correctPoints: 10 };
    const states = evaluateRound(config, [
      ev("1", "p1", "CORRECT"),
      ev("2", "p2", "CORRECT"),
      ev("3", "p2", "DISQUALIFY"),
    ]);
    const scored = toScored(states);
    expect(scored.map((s) => s.id)).toEqual(["p1"]);
  });
});

describe("evaluateRound: win condition (勝ち抜け・得点先取)", () => {
  it("flags won once score reaches the SCORE_TARGET", () => {
    const config: RuleConfig = {
      ...DEFAULT_RULE_CONFIG,
      correctPoints: 10,
      winCondition: { type: "SCORE_TARGET", targetScore: 30 },
    };
    const states = evaluateRound(config, [
      ev("1", "p1", "CORRECT"),
      ev("2", "p1", "CORRECT"),
      ev("3", "p1", "CORRECT"),
    ]);
    expect(states.get("p1")?.won).toBe(true);
    expect(states.get("p1")?.score).toBe(30);
  });

  it("does not flag won before reaching the target", () => {
    const config: RuleConfig = {
      ...DEFAULT_RULE_CONFIG,
      correctPoints: 10,
      winCondition: { type: "SCORE_TARGET", targetScore: 30 },
    };
    const states = evaluateRound(config, [ev("1", "p1", "CORRECT"), ev("2", "p1", "CORRECT")]);
    expect(states.get("p1")?.won).toBe(false);
  });

  it("stays won once reached even if score is later adjusted downward", () => {
    const config: RuleConfig = {
      ...DEFAULT_RULE_CONFIG,
      correctPoints: 10,
      winCondition: { type: "SCORE_TARGET", targetScore: 10 },
    };
    const states = evaluateRound(config, [
      ev("1", "p1", "CORRECT"),
      ev("2", "p1", "MANUAL_ADJUST", -100),
    ]);
    expect(states.get("p1")?.won).toBe(true);
    expect(states.get("p1")?.score).toBe(-90);
  });
});

describe("evaluateRound: manual score correction (得点修正) and Undo", () => {
  it("applies a manual positive or negative adjustment", () => {
    const states = evaluateRound(DEFAULT_RULE_CONFIG, [
      ev("1", "p1", "CORRECT"),
      ev("2", "p1", "MANUAL_ADJUST", 5),
    ]);
    expect(states.get("p1")?.score).toBe(15);
  });

  it("Undo = recomputing with the mistaken event removed from the log", () => {
    const events: AbstractScoreEvent[] = [
      ev("1", "p1", "CORRECT"),
      ev("2", "p1", "WRONG"), // operator misclick, needs to be undone
    ];
    const beforeUndo = evaluateRound(DEFAULT_RULE_CONFIG, events);
    expect(beforeUndo.get("p1")?.score).toBe(10); // 10 correct - 0 wrongPenalty(default 0)

    const configWithPenalty: RuleConfig = { ...DEFAULT_RULE_CONFIG, wrongPenalty: 5 };
    const beforeUndo2 = evaluateRound(configWithPenalty, events);
    expect(beforeUndo2.get("p1")?.score).toBe(5); // 10 - 5

    const afterUndo = evaluateRound(configWithPenalty, events.slice(0, -1));
    expect(afterUndo.get("p1")?.score).toBe(10); // back to pre-mistake state
    expect(afterUndo.get("p1")?.wrongCount).toBe(0);
  });

  it("recomputation is deterministic given the same event log", () => {
    const events: AbstractScoreEvent[] = [
      ev("1", "p1", "CORRECT"),
      ev("2", "p1", "WRONG"),
      ev("3", "p1", "CORRECT"),
    ];
    const run1 = evaluateRound(DEFAULT_RULE_CONFIG, events);
    const run2 = evaluateRound(DEFAULT_RULE_CONFIG, events);
    expect(run1.get("p1")).toEqual(run2.get("p1"));
  });
});

describe("evaluateRound: ties feed correctly into ranking (同点)", () => {
  it("two participants with the same score end up with the same rank downstream", () => {
    const config: RuleConfig = { ...DEFAULT_RULE_CONFIG, correctPoints: 10 };
    const states = evaluateRound(config, [
      ev("1", "p1", "CORRECT"),
      ev("2", "p2", "CORRECT"),
      ev("3", "p3", "CORRECT"),
      ev("4", "p3", "CORRECT"),
    ]);
    // p1: 10, p2: 10, p3: 20 -> p3 ranks 1st, p1/p2 tie for 2nd
    const ranked = computeRanking(toScored(states));
    const byId = Object.fromEntries(ranked.map((r) => [r.id, r.rank]));
    expect(byId).toEqual({ p3: 1, p1: 2, p2: 2 });
  });
});

describe("applyPlacementPoints (順位点)", () => {
  it("replaces raw score with the configured points for each rank", () => {
    const ranked = [
      { id: "p1", score: 90, rank: 1 },
      { id: "p2", score: 80, rank: 2 },
      { id: "p3", score: 70, rank: 3 },
    ];
    const result = applyPlacementPoints(ranked, { 1: 5, 2: 3, 3: 1 });
    expect(result).toEqual([
      { id: "p1", score: 5 },
      { id: "p2", score: 3 },
      { id: "p3", score: 1 },
    ]);
  });

  it("falls back to the raw score when a rank has no configured points", () => {
    const ranked = [{ id: "p1", score: 42, rank: 7 }];
    const result = applyPlacementPoints(ranked, { 1: 5 });
    expect(result).toEqual([{ id: "p1", score: 42 }]);
  });
});

describe("combineRoundScores (複数ラウンド合算)", () => {
  it("sums scores for the same participant across rounds", () => {
    const total = combineRoundScores([
      [{ id: "p1", score: 10 }, { id: "p2", score: 5 }],
      [{ id: "p1", score: 7 }, { id: "p2", score: 8 }],
    ]);
    const byId = Object.fromEntries(total.map((t) => [t.id, t.score]));
    expect(byId).toEqual({ p1: 17, p2: 13 });
  });

  it("treats a participant absent from a round as contributing 0", () => {
    const total = combineRoundScores([
      [{ id: "p1", score: 10 }],
      [{ id: "p1", score: 5 }, { id: "p2", score: 20 }],
    ]);
    const byId = Object.fromEntries(total.map((t) => [t.id, t.score]));
    expect(byId).toEqual({ p1: 15, p2: 20 });
  });
});
