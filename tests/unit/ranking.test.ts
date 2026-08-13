import { describe, expect, it } from "vitest";
import { computeRanking, determineAdvancement } from "@/lib/scoring/ranking";

describe("computeRanking", () => {
  it("ranks distinct scores in descending order", () => {
    const result = computeRanking([
      { id: "a", score: 70 },
      { id: "b", score: 90 },
      { id: "c", score: 80 },
    ]);
    expect(result.map((r) => [r.id, r.rank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
    ]);
  });

  it("gives tied scores the same rank and skips the next rank (1224 ranking)", () => {
    const result = computeRanking([
      { id: "a", score: 90 },
      { id: "b", score: 90 },
      { id: "c", score: 80 },
      { id: "d", score: 70 },
    ]);
    const byId = Object.fromEntries(result.map((r) => [r.id, r.rank]));
    expect(byId).toEqual({ a: 1, b: 1, c: 3, d: 4 });
  });

  it("handles a three-way tie for first place", () => {
    const result = computeRanking([
      { id: "a", score: 100 },
      { id: "b", score: 100 },
      { id: "c", score: 100 },
      { id: "d", score: 50 },
    ]);
    const byId = Object.fromEntries(result.map((r) => [r.id, r.rank]));
    expect(byId).toEqual({ a: 1, b: 1, c: 1, d: 4 });
  });

  it("handles an empty list", () => {
    expect(computeRanking([])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [
      { id: "a", score: 1 },
      { id: "b", score: 2 },
    ];
    const copy = [...input];
    computeRanking(input);
    expect(input).toEqual(copy);
  });
});

describe("determineAdvancement", () => {
  it("advances exactly advanceCount participants when there is no boundary tie", () => {
    const ranked = computeRanking([
      { id: "a", score: 90 },
      { id: "b", score: 80 },
      { id: "c", score: 70 },
      { id: "d", score: 60 },
    ]);
    const advancing = determineAdvancement(ranked, 2);
    expect(advancing).toEqual(new Set(["a", "b"]));
  });

  it("advances everyone tied at the cutoff boundary, even beyond advanceCount", () => {
    // ranks: a=1, b=2, c=2, d=4 ; cutoff of 2 lands mid-tie at rank 2
    const ranked = computeRanking([
      { id: "a", score: 90 },
      { id: "b", score: 80 },
      { id: "c", score: 80 },
      { id: "d", score: 50 },
    ]);
    const advancing = determineAdvancement(ranked, 2);
    expect(advancing).toEqual(new Set(["a", "b", "c"]));
  });

  it("returns everyone when advanceCount exceeds the field size", () => {
    const ranked = computeRanking([
      { id: "a", score: 10 },
      { id: "b", score: 5 },
    ]);
    const advancing = determineAdvancement(ranked, 10);
    expect(advancing).toEqual(new Set(["a", "b"]));
  });

  it("returns an empty set for a non-positive advanceCount", () => {
    const ranked = computeRanking([{ id: "a", score: 10 }]);
    expect(determineAdvancement(ranked, 0)).toEqual(new Set());
    expect(determineAdvancement(ranked, -1)).toEqual(new Set());
  });

  it("returns an empty set for an empty field", () => {
    expect(determineAdvancement([], 5)).toEqual(new Set());
  });
});
