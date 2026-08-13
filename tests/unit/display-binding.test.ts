import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/display/binding";
import { resolvePlayerIndex, topPlayers } from "@/lib/display/player-selector";
import type { DisplayDataContext } from "@/lib/display/types";

const ctx: DisplayDataContext = {
  tournament: { name: "サンプルオープン", logoUrl: "https://example.com/logo.png" },
  round: { name: "決勝", questionNumber: 5, status: "RUNNING" },
  players: [
    { participantId: "p1", name: "山田太郎", rank: 1, score: 30, correctCount: 3, wrongCount: 0 },
    { participantId: "p2", name: "鈴木花子", rank: 2, score: 20, correctCount: 2, wrongCount: 1 },
    { participantId: "p3", name: "佐藤次郎", rank: 2, score: 20, correctCount: 2, wrongCount: 1 },
  ],
};

describe("resolveTemplate", () => {
  it("resolves tournament and round tokens", () => {
    expect(resolveTemplate("{{tournament.name}} 第{{round.questionNumber}}問", ctx)).toBe(
      "サンプルオープン 第5問"
    );
  });

  it("resolves player tokens using the given player index", () => {
    expect(resolveTemplate("{{player.name}}: {{player.score}}点", ctx, 0)).toBe("山田太郎: 30点");
  });

  it("leaves unknown tokens verbatim instead of throwing", () => {
    expect(resolveTemplate("{{nonexistent.token}}", ctx)).toBe("{{nonexistent.token}}");
  });

  it("renders empty string for player tokens when no player index is given", () => {
    expect(resolveTemplate("{{player.name}}", ctx)).toBe("");
  });

  it("never executes arbitrary code even if the template looks like an expression", () => {
    const malicious = "{{constructor.constructor('return 1')()}}";
    expect(resolveTemplate(malicious, ctx)).toBe(malicious);
  });

  it("handles templates with no tokens at all", () => {
    expect(resolveTemplate("plain text", ctx)).toBe("plain text");
  });
});

describe("resolvePlayerIndex", () => {
  it("resolves RANK mode to the first player at that rank", () => {
    expect(resolvePlayerIndex({ mode: "RANK", rank: 1 }, ctx)).toBe(0);
  });

  it("returns the first of a tie for RANK mode", () => {
    expect(resolvePlayerIndex({ mode: "RANK", rank: 2 }, ctx)).toBe(1);
  });

  it("returns null when no player has that rank", () => {
    expect(resolvePlayerIndex({ mode: "RANK", rank: 99 }, ctx)).toBeNull();
  });

  it("resolves PARTICIPANT mode by id", () => {
    expect(resolvePlayerIndex({ mode: "PARTICIPANT", participantId: "p3" }, ctx)).toBe(2);
  });

  it("returns null for a PARTICIPANT id no longer present", () => {
    expect(resolvePlayerIndex({ mode: "PARTICIPANT", participantId: "gone" }, ctx)).toBeNull();
  });

  it("returns null when no selector is given", () => {
    expect(resolvePlayerIndex(undefined, ctx)).toBeNull();
  });
});

describe("topPlayers", () => {
  it("returns players sorted by rank, respecting the limit", () => {
    const top2 = topPlayers(ctx, 2);
    expect(top2.map((p) => p.participantId)).toEqual(["p1", "p2"]);
  });

  it("puts unranked (null rank) players last", () => {
    const withUnranked: DisplayDataContext = {
      ...ctx,
      players: [
        { participantId: "p4", name: "Unranked", rank: null, score: 0, correctCount: 0, wrongCount: 0 },
        ...ctx.players,
      ],
    };
    const top4 = topPlayers(withUnranked, 4);
    expect(top4[top4.length - 1].participantId).toBe("p4");
  });
});
