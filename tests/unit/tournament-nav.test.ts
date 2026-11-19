import { readFileSync } from "node:fs";
import path from "node:path";
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

  it("limits view-only roles to overview and rounds", () => {
    for (const role of ["VENUE_STAFF", "VIEWER"] as const) {
      expect(paths(role)).toEqual(["", "/rounds"]);
    }
  });

  it("never offers staff management or audit log to non-admin roles", () => {
    for (const role of ["QUESTION_MANAGER", "SCORE_OPERATOR", "GRADER", "STREAM_OPERATOR"] as const) {
      expect(paths(role)).not.toContain("/members");
      expect(paths(role)).not.toContain("/audit-log");
    }
  });

  // 画面側の権限判定とナビの判定が食い違うと、リンクを押しても概要へ戻される。
  // 食い違いを実ファイルから検出する。
  it.each([
    ["/participants", "participants"],
    ["/entry-fields", "entry-fields"],
    ["/layouts", "layouts"],
    ["/cms", "cms"],
    ["/announcements", "announcements"],
    ["/schedule", "schedule"],
    ["/entries", "entries"],
    ["/stages", "stages"],
    ["/members", "members"],
    ["/audit-log", "audit-log"],
  ])("ナビの権限 %s は page.tsx の can() と一致する", (navPath, dir) => {
    const file = path.join(
      process.cwd(),
      "src/app/(dashboard)/tournaments/[tournamentId]",
      dir,
      "page.tsx"
    );
    const gates = [...readFileSync(file, "utf8").matchAll(/can\(role, "(tournament:[a-z_]+)"\)/g)].map((m) => m[1]);
    const item = TOURNAMENT_NAV.flatMap((g) => g.items).find((i) => i.path === navPath)!;
    expect(gates).toContain(item.action);
  });

  it("shows nothing to a non-member", () => {
    expect(visibleNav(null)).toEqual([]);
  });

  it("has no duplicate paths", () => {
    const all = TOURNAMENT_NAV.flatMap((g) => g.items.map((i) => i.path));
    expect(new Set(all).size).toBe(all.length);
  });
});
