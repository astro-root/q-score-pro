import { describe, expect, it } from "vitest";
import {
  entryClosedMessage,
  entryWindowState,
  formatEntryWindow,
  formatJst,
  fromJstInputValue,
  toJstInputValue,
} from "@/lib/entries/window";

const OPEN = "REGISTRATION_OPEN";
const t = (iso: string) => new Date(iso);

describe("entryWindowState", () => {
  it("期間の指定がなければ、受付中ステータスの間は open", () => {
    expect(entryWindowState({ status: OPEN, opensAt: null, closesAt: null }, t("2026-11-20T00:00:00Z"))).toBe("open");
  });

  it("開始前は not_open_yet、開始ちょうどは open", () => {
    const input = { status: OPEN, opensAt: "2026-11-20T01:00:00Z", closesAt: null };
    expect(entryWindowState(input, t("2026-11-20T00:59:59Z"))).toBe("not_open_yet");
    expect(entryWindowState(input, t("2026-11-20T01:00:00Z"))).toBe("open");
  });

  it("締切ちょうどは受け付けない(DBの now() < closes_at と同じ)", () => {
    const input = { status: OPEN, opensAt: null, closesAt: "2026-12-01T00:00:00Z" };
    expect(entryWindowState(input, t("2026-11-30T23:59:59Z"))).toBe("open");
    expect(entryWindowState(input, t("2026-12-01T00:00:00Z"))).toBe("deadline_passed");
  });

  it("ステータスが受付中でなければ、期間内でも受け付けない", () => {
    const w = { opensAt: "2026-11-01T00:00:00Z", closesAt: "2026-12-31T00:00:00Z" };
    const now = t("2026-11-20T00:00:00Z");
    expect(entryWindowState({ status: "DRAFT", ...w }, now)).toBe("registration_closed");
    expect(entryWindowState({ status: "REGISTRATION_CLOSED", ...w }, now)).toBe("registration_closed");
    expect(entryWindowState({ status: "CANCELLED", ...w }, now)).toBe("cancelled");
  });

  it("壊れた日時は無制限として扱う(締め出さない)", () => {
    expect(entryWindowState({ status: OPEN, opensAt: "garbage", closesAt: "x" }, t("2026-11-20T00:00:00Z"))).toBe("open");
  });
});

describe("日本時間の表示", () => {
  it("UTC を JST (+9) に直して表示する", () => {
    expect(formatJst("2026-11-20T01:00:00Z")).toBe("2026/11/20 10:00");
    expect(formatJst("2026-11-30T15:00:00Z")).toBe("2026/12/01 00:00");
  });

  it("空・不正は空文字", () => {
    expect(formatJst(null)).toBe("");
    expect(formatJst("nope")).toBe("");
  });

  it("期間の表記", () => {
    expect(formatEntryWindow(null, null)).toBeNull();
    expect(formatEntryWindow("2026-11-20T01:00:00Z", "2026-12-01T14:59:00Z")).toBe("2026/11/20 10:00 〜 2026/12/01 23:59");
    expect(formatEntryWindow(null, "2026-12-01T14:59:00Z")).toContain("開始日時の指定なし");
  });

  it("受付できない理由を日本時間つきで伝える", () => {
    const input = { status: OPEN, opensAt: "2026-11-20T01:00:00Z", closesAt: "2026-12-01T14:59:00Z" };
    expect(entryClosedMessage("not_open_yet", input)).toContain("2026/11/20 10:00");
    expect(entryClosedMessage("deadline_passed", input)).toContain("2026/12/01 23:59");
    expect(entryClosedMessage("open", input)).toBe("");
  });
});

describe("datetime-local との変換 (日本時間)", () => {
  it("入力値を JST として UTC の ISO にする", () => {
    expect(fromJstInputValue("2026-11-20T10:00")).toBe("2026-11-20T01:00:00.000Z");
    expect(fromJstInputValue("2026-12-01T00:00")).toBe("2026-11-30T15:00:00.000Z");
  });

  it("ISO を入力値に戻すと元に戻る(往復で値が変わらない)", () => {
    for (const v of ["2026-11-20T10:00", "2026-12-01T00:00", "2027-01-01T23:59"]) {
      expect(toJstInputValue(fromJstInputValue(v))).toBe(v);
    }
  });

  it("空・不正は null / 空文字", () => {
    expect(fromJstInputValue("")).toBeNull();
    expect(fromJstInputValue("2026-11-20")).toBeNull();
    expect(fromJstInputValue("2026-13-45T99:99")).toBeNull();
    expect(toJstInputValue(null)).toBe("");
  });
});
