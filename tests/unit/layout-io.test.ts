import { describe, expect, it } from "vitest";
import {
  LAYOUT_EXPORT_FORMAT,
  LAYOUT_EXPORT_VERSION,
  buildLayoutExport,
  layoutDataSchema,
  parseLayoutImport,
} from "@/lib/display/layout-io";
import { MAX_BLOCKS } from "@/lib/display/limits";
import { isSafeImageUrl } from "@/lib/display/safe-url";
import {
  DEFAULT_BLOCK_STYLE,
  DEFAULT_CANVAS,
  type BlockType,
  type DisplayBlock,
  type DisplayLayoutData,
} from "@/lib/display/types";
import { createDefaultBlock } from "@/app/(dashboard)/tournaments/[tournamentId]/layouts/[layoutId]/create-default-block";

function block(overrides: Partial<DisplayBlock> = {}): DisplayBlock {
  return {
    id: "b1",
    type: "TEXT",
    rect: { x: 10, y: 20, width: 300, height: 80, zIndex: 1 },
    style: { ...DEFAULT_BLOCK_STYLE },
    visible: true,
    content: "{{tournament.name}}",
    ...overrides,
  };
}

function layout(blocks: DisplayBlock[] = [block()]): DisplayLayoutData {
  return { canvas: { ...DEFAULT_CANVAS }, blocks };
}

/** 書き出し → JSON文字列 → 読み込み、をまとめて行う(実際のファイル経由と同じ) */
function viaFile(data: DisplayLayoutData, name = "Main") {
  const text = JSON.stringify(buildLayoutExport(name, data));
  return parseLayoutImport(JSON.parse(text));
}

describe("書き出し", () => {
  it("形式名とバージョンが入る", () => {
    const file = buildLayoutExport("Main", layout(), new Date("2026-11-16T00:00:00Z"));
    expect(file.format).toBe(LAYOUT_EXPORT_FORMAT);
    expect(file.version).toBe(LAYOUT_EXPORT_VERSION);
    expect(file.exportedAt).toBe("2026-11-16T00:00:00.000Z");
    expect(file.name).toBe("Main");
  });
});

describe("取り込み: 往復", () => {
  it("書き出したレイアウトをそのまま取り込める(IDだけ振り直される)", () => {
    const original = layout([
      block({ id: "a" }),
      block({ id: "b", type: "RANKING_LIST", content: "", listLimit: 5 }),
    ]);
    const r = viaFile(original, "決勝用");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe("決勝用");
    expect(r.warnings).toEqual([]);
    expect(r.data.canvas).toEqual(original.canvas);
    expect(r.data.blocks.map((b) => b.id)).toEqual(["block-imported-1", "block-imported-2"]);
    expect(r.data.blocks.map(({ id, ...rest }) => (void id, rest))).toEqual(
      original.blocks.map(({ id, ...rest }) => (void id, rest))
    );
  });

  it("エディタが作る全種類の既定ブロックが、検証を通る(エディタの保存と取り込みが両立する)", () => {
    const types: BlockType[] = ["TEXT", "IMAGE", "SHAPE", "PLAYER_CARD", "RANKING_LIST", "SCOREBOARD"];
    const data = layout(types.map((t, i) => createDefaultBlock(t, i + 1)));
    expect(layoutDataSchema.safeParse(data).success).toBe(true);
  });

  it("未知のフィールドは取り除かれる", () => {
    const text = JSON.stringify(buildLayoutExport("x", layout()));
    const file = JSON.parse(text);
    file.data.blocks[0].evil = "<script>";
    file.data.canvas.extra = 1;
    const r = parseLayoutImport(file);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.blocks[0]).not.toHaveProperty("evil");
    expect(r.data.canvas).not.toHaveProperty("extra");
  });

  it("名前が無い・空白だけなら null、長すぎれば100文字に切る", () => {
    const base = buildLayoutExport("x", layout());
    const a = parseLayoutImport({ ...base, name: undefined });
    const b = parseLayoutImport({ ...base, name: "   " });
    const c = parseLayoutImport({ ...base, name: "あ".repeat(300) });
    expect(a.ok && a.name).toBeNull();
    expect(b.ok && b.name).toBeNull();
    expect(c.ok && c.name?.length).toBe(100);
  });
});

describe("取り込み: 他の大会の選手への固定", () => {
  it("PARTICIPANT は「1位」に置き換わり、件数つきの警告が出る", () => {
    const r = viaFile(
      layout([
        block({ id: "a", type: "PLAYER_CARD", playerSelector: { mode: "PARTICIPANT", participantId: "uuid-1" } }),
        block({ id: "b", type: "PLAYER_CARD", playerSelector: { mode: "PARTICIPANT", participantId: "uuid-2" } }),
        block({ id: "c", type: "PLAYER_CARD", playerSelector: { mode: "RANK", rank: 3 } }),
      ])
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.blocks[0].playerSelector).toEqual({ mode: "RANK", rank: 1 });
    expect(r.data.blocks[1].playerSelector).toEqual({ mode: "RANK", rank: 1 });
    expect(r.data.blocks[2].playerSelector).toEqual({ mode: "RANK", rank: 3 }); // 順位指定はそのまま
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("2 件");
    expect(JSON.stringify(r.data)).not.toContain("uuid-");
  });
});

describe("取り込み: ファイルの形・バージョン", () => {
  it("オブジェクトでないものは拒否", () => {
    for (const bad of [null, "text", 42, [], undefined]) {
      expect(parseLayoutImport(bad).ok).toBe(false);
    }
  });

  it("別の形式のファイルは拒否(大会バックアップなど)", () => {
    const r = parseLayoutImport({ exportedAt: "x", schemaVersion: 2, tournament: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("表示レイアウトのファイルではありません");
  });

  it("バージョンが不正・新しすぎる場合は拒否し、理由を伝える", () => {
    const base = buildLayoutExport("x", layout());
    expect(parseLayoutImport({ ...base, version: 0 }).ok).toBe(false);
    expect(parseLayoutImport({ ...base, version: 1.5 }).ok).toBe(false);
    expect(parseLayoutImport({ ...base, version: "1" }).ok).toBe(false);
    const future = parseLayoutImport({ ...base, version: LAYOUT_EXPORT_VERSION + 1 });
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.message).toContain("新しいバージョン");
  });

  it("内容が壊れている場合は、どこが悪いかを示して拒否する", () => {
    const file = JSON.parse(JSON.stringify(buildLayoutExport("x", layout([block(), block({ id: "b2" })]))));
    file.data.blocks[1].style.fontSize = 0;
    const r = parseLayoutImport(file);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("blocks[2].style.fontSize");
  });
});

describe("取り込み: 画像URLの安全性", () => {
  const imageBlock = (content: string) => layout([block({ type: "IMAGE", content })]);
  const withBackground = (url: string) => ({
    canvas: { ...DEFAULT_CANVAS, backgroundImageUrl: url },
    blocks: [],
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "//evil.example/x.png", // プロトコル相対
    'https://example.com/a.png")',
    "https://example.com/a b.png",
    "https://example.com/a.png'",
    "ftp://example.com/a.png",
    "file:///etc/passwd",
    "https://example.com/<x>.png",
  ])("危険・不正なURLは拒否: %s", (url) => {
    expect(viaFile(imageBlock(url)).ok).toBe(false);
    expect(viaFile(withBackground(url)).ok).toBe(false);
  });

  it.each([
    "https://example.com/a.png",
    "http://example.com/a.png?x=1&y=2",
    "/images/logo.png",
    "{{tournament.logoUrl}}",
    "",
  ])("安全なURL・トークン・空は許可: %s", (value) => {
    expect(viaFile(imageBlock(value)).ok).toBe(true);
  });

  it("背景画像のURLも同じ基準で検証する(空は許可)", () => {
    expect(viaFile(withBackground("")).ok).toBe(true);
    expect(viaFile(withBackground("https://example.com/bg.jpg")).ok).toBe(true);
  });

  it("isSafeImageUrl の単体", () => {
    expect(isSafeImageUrl("https://example.com/a.png")).toBe(true);
    expect(isSafeImageUrl("/a.png")).toBe(true);
    expect(isSafeImageUrl("//a.png")).toBe(false);
    expect(isSafeImageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeImageUrl("https://example.com/" + "a".repeat(2000))).toBe(false);
  });
});

describe("取り込み: 色と数値の範囲", () => {
  const withStyle = (style: Partial<DisplayBlock["style"]>) =>
    layout([block({ style: { ...DEFAULT_BLOCK_STYLE, ...style } })]);

  it("CSSの色として正しいものは許可", () => {
    for (const c of ["#fff", "#0f172a", "rgba(0, 0, 0, 0.5)", "hsl(120, 50%, 50%)", "red", ""]) {
      expect(viaFile(withStyle({ backgroundColor: c })).ok).toBe(true);
    }
  });

  it("url(...) や別のプロパティを混ぜた値は拒否", () => {
    for (const c of ["url(https://evil.example/x.png)", "red; position: fixed", "red /* x */", "expression:alert(1)"]) {
      expect(viaFile(withStyle({ textColor: c })).ok).toBe(false);
    }
  });

  it("範囲外の数値は拒否", () => {
    expect(viaFile(withStyle({ fontSize: 0 })).ok).toBe(false);
    expect(viaFile(withStyle({ fontSize: 99_999 })).ok).toBe(false);
    expect(viaFile(withStyle({ opacity: 2 })).ok).toBe(false);
    expect(viaFile(withStyle({ opacity: -0.1 })).ok).toBe(false);
    expect(viaFile(withStyle({ padding: -1 })).ok).toBe(false);
    expect(
      viaFile({ canvas: { ...DEFAULT_CANVAS, width: 0 }, blocks: [] }).ok
    ).toBe(false);
    expect(
      viaFile(layout([block({ rect: { x: 0, y: 0, width: 1e9, height: 10, zIndex: 1 } })])).ok
    ).toBe(false);
  });

  it("NaN / Infinity は拒否(JSONでは null になるので型エラーになる)", () => {
    const file = JSON.parse(JSON.stringify(buildLayoutExport("x", layout())));
    file.data.blocks[0].rect.width = null;
    expect(parseLayoutImport(file).ok).toBe(false);
  });

  it("ブロック数の上限を超えると拒否、ちょうど上限なら許可", () => {
    const make = (n: number) => layout(Array.from({ length: n }, (_, i) => block({ id: `b${i}` })));
    expect(viaFile(make(MAX_BLOCKS)).ok).toBe(true);
    expect(viaFile(make(MAX_BLOCKS + 1)).ok).toBe(false);
  });

  it("content が長すぎる場合は拒否", () => {
    expect(viaFile(layout([block({ content: "あ".repeat(2001) })])).ok).toBe(false);
    expect(viaFile(layout([block({ content: "あ".repeat(2000) })])).ok).toBe(true);
  });
});
