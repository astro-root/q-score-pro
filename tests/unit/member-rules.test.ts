import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ROLES,
  checkMemberChange,
  mapMemberDbError,
} from "@/lib/tournament/member-rules";

const ME = "user-me";

describe("checkMemberChange (R-06)", () => {
  it("OWNER は変更も削除もできない", () => {
    expect(
      checkMemberChange({ actorUserId: ME, target: { userId: "u1", role: "OWNER" }, newRole: "VIEWER" })
    ).toBe("target_is_owner");
    expect(
      checkMemberChange({ actorUserId: ME, target: { userId: "u1", role: "OWNER" } })
    ).toBe("target_is_owner");
  });

  it("自分自身は変更も削除もできない", () => {
    expect(
      checkMemberChange({ actorUserId: ME, target: { userId: ME, role: "ADMIN" }, newRole: "VIEWER" })
    ).toBe("cannot_change_self");
    expect(
      checkMemberChange({ actorUserId: ME, target: { userId: ME, role: "ADMIN" } })
    ).toBe("cannot_change_self");
  });

  it("OWNER ロールは付与できない", () => {
    expect(
      checkMemberChange({ actorUserId: ME, target: { userId: "u1", role: "VIEWER" }, newRole: "OWNER" })
    ).toBe("role_not_assignable");
  });

  it("一般スタッフのロール変更・削除は許可される", () => {
    expect(
      checkMemberChange({
        actorUserId: ME,
        target: { userId: "u1", role: "VIEWER" },
        newRole: "SCORE_OPERATOR",
      })
    ).toBeNull();
    expect(
      checkMemberChange({ actorUserId: ME, target: { userId: "u1", role: "GRADER" } })
    ).toBeNull();
  });

  it("付与できるロールに OWNER は含まれず、OWNER 以外は全て含まれる", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("OWNER");
    expect(ASSIGNABLE_ROLES).toHaveLength(7);
  });
});

describe("mapMemberDbError", () => {
  it("DBトリガーの owner_* エラーは 403 target_is_owner", () => {
    const r = mapMemberDbError({ code: "42501", message: "owner_cannot_be_demoted" });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("target_is_owner");
  });
  it("その他の権限エラーは 403 forbidden", () => {
    expect(mapMemberDbError({ code: "42501", message: "rls" }).body.error).toBe("forbidden");
  });
  it("想定外は 500", () => {
    expect(mapMemberDbError({ message: "boom" }).status).toBe(500);
  });
});
