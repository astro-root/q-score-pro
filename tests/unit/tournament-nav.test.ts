import { describe, expect, it } from "vitest";
import { TOURNAMENT_NAV, visibleNav } from "@/lib/tournament/nav";
import { can } from "@/lib/permissions";
import type { TournamentMemberRole } from "@/types/database";

const ROLES: TournamentMemberRole[] = [
  "OWNER",
  "ADMIN",
  "QUESTION_MANAGER",
  "SCORE_OPERATOR",
  "GRADER",
  "STREAM_OPERATOR",
  "VENUE_STAFF",
  "VIEWER",
];

const paths = (role: TournamentMemberRole | null) =>
  visibleNav(role).flatMap((g) => g.items.map((i) => i.path));

describe("tournament nav visibility", () => {
  it("shows every screen to OWNER and ADMIN", () => {
    const all = TOURNAMENT_NAV.flatMap((g) => g.items.map((i) => i.path));
    expect(paths("OWNER")).toEqual(all);
    expect(paths("ADMIN")).toEqual(all);
  });

  it("never offers an item the role cannot use", () => {
    for (const role of ROLES) {
      for (const g of visibleNav(role)) {
        for (const i of g.items) expect(can(role, i.action)).toBe(true);
      }
    }
  });

  it("limits view-only roles to overview, participants and rounds", () => {
    for (const role of ["VENUE_STAFF", "VIEWER"] as const) {
      expect(paths(role)).toEqual(["", "/participants", "/rounds"]);
    }
  });

  it("gives STREAM_OPERATOR the display layouts but not staff management", () => {
    expect(paths("STREAM_OPERATOR")).toContain("/layouts");
    expect(paths("STREAM_OPERATOR")).not.toContain("/members");
  });

  it("shows nothing to a non-member", () => {
    expect(visibleNav(null)).toEqual([]);
  });

  it("has no duplicate paths", () => {
    const all = TOURNAMENT_NAV.flatMap((g) => g.items.map((i) => i.path));
    expect(new Set(all).size).toBe(all.length);
  });
});
