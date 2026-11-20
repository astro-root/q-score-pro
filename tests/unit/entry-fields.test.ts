import { describe, expect, it } from "vitest";
import { moveItem, nextFieldKey, parseOptions, validateFieldDrafts } from "@/lib/entries/fields";

const draft = (over: Partial<{ fieldKey: string; label: string; fieldType: string; optionsText: string }> = {}) => ({
  fieldKey: "grade",
  label: "学年",
  fieldType: "TEXT",
  optionsText: "",
  ...over,
});

describe("nextFieldKey", () => {
  it("使われていない最小番号を返す", () => {
    expect(nextFieldKey([])).toBe("field_1");
    expect(nextFieldKey(["field_1", "field_2"])).toBe("field_3");
    expect(nextFieldKey(["field_2"])).toBe("field_1");
    expect(nextFieldKey(["grade"])).toBe("field_1");
  });
});

describe("moveItem", () => {
  it("上下に1つ動かす(元の配列は変えない)", () => {
    const a = ["x", "y", "z"];
    expect(moveItem(a, 1, -1)).toEqual(["y", "x", "z"]);
    expect(moveItem(a, 1, 1)).toEqual(["x", "z", "y"]);
    expect(a).toEqual(["x", "y", "z"]);
  });

  it("端や範囲外では動かさない", () => {
    expect(moveItem(["x", "y"], 0, -1)).toEqual(["x", "y"]);
    expect(moveItem(["x", "y"], 1, 1)).toEqual(["x", "y"]);
    expect(moveItem(["x", "y"], 5, 1)).toEqual(["x", "y"]);
  });
});

describe("parseOptions", () => {
  it("カンマ(半角・全角読点)と改行で区切り、空を除く", () => {
    expect(parseOptions("中学生, 高校生、一般\n  大学生 ,, ")).toEqual(["中学生", "高校生", "一般", "大学生"]);
  });
});

describe("validateFieldDrafts", () => {
  it("正しい入力ならエラーなし", () => {
    expect(validateFieldDrafts([draft(), draft({ fieldKey: "club", label: "部活" })]).size).toBe(0);
  });

  it("ラベル空・キー不正・キー重複・選択肢なしを項目ごとに検出する", () => {
    const errors = validateFieldDrafts([
      draft({ label: " " }),
      draft({ fieldKey: "Bad Key" }),
      draft({ fieldKey: "dup" }),
      draft({ fieldKey: "dup", label: "別" }),
      draft({ fieldKey: "pick", label: "区分", fieldType: "SELECT", optionsText: " , " }),
    ]);
    expect([...errors.keys()]).toEqual([0, 1, 3, 4]);
    expect(errors.get(3)).toContain("3 番目");
    expect(errors.get(4)).toContain("選択肢");
  });

  it("選択肢があれば SELECT は有効", () => {
    expect(validateFieldDrafts([draft({ fieldType: "SELECT", optionsText: "A, B" })]).size).toBe(0);
  });
});
