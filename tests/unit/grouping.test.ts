import { describe, expect, it } from "vitest";
import {
  applySeparationConstraints,
  assignGroupsRoundRobin,
  assignGroupsSequentialBlocks,
  assignGroupsSnake,
} from "@/lib/scoring/grouping";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe("assignGroupsSnake", () => {
  it("distributes into 4 groups in serpentine order", () => {
    const assignment = assignGroupsSnake(ids(8), 4);
    // 1->A 2->B 3->C 4->D 5->D 6->C 7->B 8->A
    expect(assignment).toEqual({
      p1: "A",
      p2: "B",
      p3: "C",
      p4: "D",
      p5: "D",
      p6: "C",
      p7: "B",
      p8: "A",
    });
  });

  it("keeps group sizes balanced within 1 when count doesn't divide evenly", () => {
    const assignment = assignGroupsSnake(ids(9), 4);
    const counts = Object.values(assignment).reduce<Record<string, number>>((acc, g) => {
      acc[g] = (acc[g] ?? 0) + 1;
      return acc;
    }, {});
    const sizes = Object.values(counts);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it("throws for a non-positive group count", () => {
    expect(() => assignGroupsSnake(ids(4), 0)).toThrow();
  });
});

describe("assignGroupsRoundRobin", () => {
  it("cycles through groups in order without reversing", () => {
    const assignment = assignGroupsRoundRobin(ids(6), 3);
    expect(assignment).toEqual({
      p1: "A",
      p2: "B",
      p3: "C",
      p4: "A",
      p5: "B",
      p6: "C",
    });
  });
});

describe("assignGroupsSequentialBlocks", () => {
  it("puts the top block entirely in group A", () => {
    const assignment = assignGroupsSequentialBlocks(ids(9), 3);
    expect(assignment.p1).toBe("A");
    expect(assignment.p2).toBe("A");
    expect(assignment.p3).toBe("A");
    expect(assignment.p4).toBe("B");
    expect(assignment.p9).toBe("C");
  });
});

describe("applySeparationConstraints", () => {
  it("moves a later-seeded conflicting participant to a different group", () => {
    const base = assignGroupsRoundRobin(ids(6), 3); // p1:A p2:B p3:C p4:A p5:B p6:C
    const { assignment, unresolved } = applySeparationConstraints(ids(6), base, [["p1", "p4"]]);
    expect(assignment.p1).toBe(base.p1); // higher seed keeps its slot
    expect(assignment.p4).not.toBe(assignment.p1);
    expect(unresolved).toEqual([]);
  });

  it("leaves already-separated participants untouched", () => {
    const base = assignGroupsRoundRobin(ids(6), 3); // p1:A p2:B
    const { assignment, unresolved } = applySeparationConstraints(ids(6), base, [["p1", "p2"]]);
    expect(assignment).toEqual(base);
    expect(unresolved).toEqual([]);
  });

  it("reports a constraint as unresolved when there are more constrained people than groups", () => {
    const base = assignGroupsRoundRobin(ids(3), 2); // p1:A p2:B p3:A
    const { unresolved } = applySeparationConstraints(ids(3), base, [["p1", "p2", "p3"]]);
    expect(unresolved.length).toBeGreaterThan(0);
  });

  it("does not change the overall group size distribution", () => {
    const base = assignGroupsSnake(ids(10), 4);
    const { assignment } = applySeparationConstraints(ids(10), base, [["p1", "p8"]]);
    const countBefore = Object.values(base).reduce<Record<string, number>>((acc, g) => {
      acc[g] = (acc[g] ?? 0) + 1;
      return acc;
    }, {});
    const countAfter = Object.values(assignment).reduce<Record<string, number>>((acc, g) => {
      acc[g] = (acc[g] ?? 0) + 1;
      return acc;
    }, {});
    expect(countAfter).toEqual(countBefore);
  });
});
