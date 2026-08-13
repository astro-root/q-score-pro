import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

describe("permissions.can", () => {
  it("OWNER can do everything a role can be asked", () => {
    expect(can("OWNER", "tournament:delete")).toBe(true);
    expect(can("OWNER", "tournament:operate_score")).toBe(true);
    expect(can("OWNER", "tournament:manage_staff")).toBe(true);
  });

  it("ADMIN can manage the tournament but not delete it", () => {
    expect(can("ADMIN", "tournament:update_settings")).toBe(true);
    expect(can("ADMIN", "tournament:manage_cms")).toBe(true);
    expect(can("ADMIN", "tournament:delete")).toBe(false);
  });

  it("SCORE_OPERATOR is limited to scoring + view", () => {
    expect(can("SCORE_OPERATOR", "tournament:operate_score")).toBe(true);
    expect(can("SCORE_OPERATOR", "tournament:view")).toBe(true);
    expect(can("SCORE_OPERATOR", "tournament:manage_staff")).toBe(false);
    expect(can("SCORE_OPERATOR", "tournament:manage_cms")).toBe(false);
    expect(can("SCORE_OPERATOR", "tournament:delete")).toBe(false);
  });

  it("VIEWER can only view", () => {
    expect(can("VIEWER", "tournament:view")).toBe(true);
    expect(can("VIEWER", "tournament:operate_score")).toBe(false);
  });

  it("returns false for a null/undefined role instead of throwing", () => {
    expect(can(null, "tournament:view")).toBe(false);
    expect(can(undefined, "tournament:view")).toBe(false);
  });

  it("every role has at least tournament:view", () => {
    const roles = [
      "OWNER",
      "ADMIN",
      "QUESTION_MANAGER",
      "SCORE_OPERATOR",
      "GRADER",
      "STREAM_OPERATOR",
      "VENUE_STAFF",
      "VIEWER",
    ] as const;
    for (const role of roles) {
      expect(can(role, "tournament:view")).toBe(true);
    }
  });
});
