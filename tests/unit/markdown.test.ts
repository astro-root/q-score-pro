import { describe, expect, it } from "vitest";
import { isSafeHref, parseInline, parseMarkdown } from "@/lib/markdown";

describe("parseInline", () => {
  it("太字・コード・リンクを取り出す", () => {
    expect(parseInline("a **b** `c` [d](https://example.com/x) e")).toEqual([
      { type: "text", value: "a " },
      { type: "bold", value: "b" },
      { type: "text", value: " " },
      { type: "code", value: "c" },
      { type: "text", value: " " },
      { type: "link", href: "https://example.com/x", value: "d" },
      { type: "text", value: " e" },
    ]);
  });

  it("javascript: / data: のリンクはリンクにしない(書かれた文字のまま残す)", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html;base64,AAAA", "vbscript:x", "//evil.example"]) {
      const out = parseInline(`[click](${bad})`);
      expect(out).toEqual([{ type: "text", value: `[click](${bad})` }]);
    }
  });

  it("http / https / mailto は許可する", () => {
    expect(isSafeHref("http://a.example")).toBe(true);
    expect(isSafeHref("https://a.example/p?q=1#h")).toBe(true);
    expect(isSafeHref("mailto:staff@example.com")).toBe(true);
    expect(isSafeHref("JAVASCRIPT:alert(1)")).toBe(false);
    expect(isSafeHref("https://a b")).toBe(false);
  });

  it("HTML タグは解釈されず、ただの文字になる", () => {
    expect(parseInline('<script>alert(1)</script><img src=x onerror=alert(1)>')).toEqual([
      { type: "text", value: '<script>alert(1)</script><img src=x onerror=alert(1)>' },
    ]);
  });
});

describe("parseMarkdown", () => {
  it("見出し・段落・箇条書き・番号リスト・区切り線", () => {
    const blocks = parseMarkdown(["# 大会ルール", "", "- 1問正解で10点", "- 誤答は-5点", "", "1. 準備", "2) 開始", "", "---", "おわり"].join("\n"));
    expect(blocks.map((b) => b.type)).toEqual(["heading", "list", "list", "rule", "paragraph"]);
    expect(blocks[1]).toMatchObject({ type: "list", ordered: false });
    expect((blocks[1] as { items: unknown[] }).items).toHaveLength(2);
    expect(blocks[2]).toMatchObject({ type: "list", ordered: true });
  });

  it("連続する行は同じ段落で、行ごとに分かれる(<br> になる)", () => {
    const [p] = parseMarkdown("1行目\n2行目");
    expect(p).toMatchObject({ type: "paragraph" });
    expect((p as { lines: unknown[] }).lines).toHaveLength(2);
  });

  it("CRLF でも同じ結果になる", () => {
    expect(parseMarkdown("# a\r\n\r\n- b\r\n- c")).toEqual(parseMarkdown("# a\n\n- b\n- c"));
  });

  it("空文字・空白だけなら何も出さない", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("  \n \n")).toEqual([]);
  });

  it("4段階以上の # は見出しにしない(段落として残す)", () => {
    expect(parseMarkdown("#### x")[0].type).toBe("paragraph");
  });

  it("リストの種類が変わると別のリストになる", () => {
    expect(parseMarkdown("- a\n1. b").map((b) => b.type)).toEqual(["list", "list"]);
  });
});
