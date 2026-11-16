/**
 * 表示レイアウトの検証・書き出し・取り込み (D-05)。
 *
 * 取り込む JSON は「外部から来た信頼できない入力」として扱う。
 * - 形・数値の範囲・文字数を検証する(巨大な値や壊れた値で画面や保存を壊さない)
 * - 画像URLは http(s) かサイト内パスのみ。引用符・括弧・空白を含むものは拒否する
 *   (CSS の url(...) や <img src> に埋め込まれるため)
 * - 他の大会の選手に固定されたブロック(PARTICIPANT)は、取り込み先では意味がないので
 *   「1位の選手」に変えて、警告として知らせる
 * - ブロックIDは取り込み時に振り直す(重複や衝突を避ける)
 *
 * エディタの保存(PATCH /layouts/[id])も同じスキーマを使う。
 */
import { z } from "zod";
import { MAX_BLOCKS } from "./limits";
import { isSafeImageUrl } from "./safe-url";
import type { DisplayLayoutData } from "./types";

export const LAYOUT_EXPORT_FORMAT = "qscore-display-layout";
export const LAYOUT_EXPORT_VERSION = 1;

const MAX_CONTENT_LENGTH = 2000;

// CSS の色として使える文字だけ(#hex / 色名 / rgb() / hsl() など)。
// ':' ';' '/' を含めないので、url(...) や別のプロパティは書けない。
const cssColor = z
  .string()
  .max(64)
  .regex(/^[#a-zA-Z0-9(),.%\s-]*$/, "色の形式が正しくありません");

/** 画像URL: 空、または安全なURL(判定は safe-url.ts) */
const imageUrl = z
  .string()
  .refine((v) => v === "" || isSafeImageUrl(v), "画像のURLは http(s) で始まる形式にしてください");

const SINGLE_TOKEN = /^\{\{\s*[a-zA-Z0-9_.]+\s*\}\}$/;

const blockStyleSchema = z.object({
  backgroundColor: cssColor,
  textColor: cssColor,
  fontSize: z.number().min(1).max(2000),
  fontWeight: z.enum(["normal", "bold"]),
  borderRadius: z.number().min(0).max(10_000),
  borderColor: cssColor,
  borderWidth: z.number().min(0).max(500),
  opacity: z.number().min(0).max(1),
  padding: z.number().min(0).max(2000),
  textAlign: z.enum(["left", "center", "right"]),
});

const playerSelectorSchema = z.union([
  z.object({ mode: z.literal("RANK"), rank: z.number().int().positive().max(10_000) }),
  z.object({ mode: z.literal("PARTICIPANT"), participantId: z.string().max(100) }),
]);

const blockSchema = z
  .object({
    id: z.string().min(1).max(100),
    type: z.enum(["TEXT", "IMAGE", "SHAPE", "PLAYER_CARD", "RANKING_LIST", "SCOREBOARD"]),
    rect: z.object({
      x: z.number().min(-100_000).max(100_000),
      y: z.number().min(-100_000).max(100_000),
      width: z.number().min(0).max(100_000),
      height: z.number().min(0).max(100_000),
      zIndex: z.number().int().min(-10_000).max(10_000),
    }),
    style: blockStyleSchema,
    visible: z.boolean(),
    content: z.string().max(MAX_CONTENT_LENGTH),
    playerSelector: playerSelectorSchema.optional(),
    playerFields: z
      .array(z.enum(["rank", "name", "score", "correctCount", "wrongCount"]))
      .max(10)
      .optional(),
    listLimit: z.number().int().positive().max(1000).optional(),
  })
  .superRefine((block, ctx) => {
    // IMAGE の content は「空」「{{token}} 1つ」「http(s)のURL」のいずれか
    if (block.type === "IMAGE") {
      const c = block.content.trim();
      if (c !== "" && !SINGLE_TOKEN.test(c) && !isSafeImageUrl(c)) {
        ctx.addIssue({
          code: "custom",
          path: ["content"],
          message: "画像ブロックには http(s) のURLか {{トークン}} を指定してください",
        });
      }
    }
  });

export const layoutDataSchema = z.object({
  canvas: z.object({
    width: z.number().min(1).max(20_000),
    height: z.number().min(1).max(20_000),
    backgroundColor: cssColor,
    backgroundImageUrl: imageUrl,
  }),
  blocks: z.array(blockSchema).max(MAX_BLOCKS),
});

// ---------------------------------------------------------------------------
// 書き出し
// ---------------------------------------------------------------------------
export interface LayoutExportFile {
  format: typeof LAYOUT_EXPORT_FORMAT;
  version: number;
  name: string;
  exportedAt: string;
  data: DisplayLayoutData;
}

export function buildLayoutExport(
  name: string,
  data: DisplayLayoutData,
  now: Date = new Date()
): LayoutExportFile {
  return {
    format: LAYOUT_EXPORT_FORMAT,
    version: LAYOUT_EXPORT_VERSION,
    name,
    exportedAt: now.toISOString(),
    data,
  };
}

// ---------------------------------------------------------------------------
// 取り込み
// ---------------------------------------------------------------------------
export type LayoutImportResult =
  | { ok: true; name: string | null; data: DisplayLayoutData; warnings: string[] }
  | { ok: false; message: string };

function describeIssues(error: z.ZodError): string {
  const lines = error.issues.slice(0, 5).map((issue) => {
    const path = issue.path
      .map((p) => (typeof p === "number" ? `[${p + 1}]` : `.${String(p)}`))
      .join("")
      .replace(/^\./, "");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  const more = error.issues.length > 5 ? `(ほか ${error.issues.length - 5} 件)` : "";
  return lines.join(" / ") + more;
}

export function parseLayoutImport(raw: unknown): LayoutImportResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "レイアウトのファイルではありません" };
  }
  const file = raw as Record<string, unknown>;

  if (file.format !== LAYOUT_EXPORT_FORMAT) {
    return {
      ok: false,
      message: "Q-Score Pro の表示レイアウトのファイルではありません(format が一致しません)",
    };
  }
  if (typeof file.version !== "number" || !Number.isInteger(file.version) || file.version < 1) {
    return { ok: false, message: "ファイルのバージョンが正しくありません" };
  }
  if (file.version > LAYOUT_EXPORT_VERSION) {
    return {
      ok: false,
      message: `このファイルは新しいバージョン(v${file.version})で作られています。アプリを更新してから取り込んでください`,
    };
  }

  const parsed = layoutDataSchema.safeParse(file.data);
  if (!parsed.success) {
    return { ok: false, message: `レイアウトの内容が正しくありません: ${describeIssues(parsed.error)}` };
  }

  const warnings: string[] = [];
  let pinned = 0;

  const blocks = parsed.data.blocks.map((block, index) => {
    const next = { ...block, id: `block-imported-${index + 1}` };
    // 他の大会の選手IDは取り込み先では存在しない。1位の選手に置き換える
    if (next.playerSelector?.mode === "PARTICIPANT") {
      next.playerSelector = { mode: "RANK", rank: 1 };
      pinned += 1;
    }
    return next;
  });

  if (pinned > 0) {
    warnings.push(
      `選手を固定していたブロックが ${pinned} 件ありました。取り込み先に同じ選手はいないため、「1位の選手」に変更しました。必要なら編集してください`
    );
  }

  const name =
    typeof file.name === "string" && file.name.trim() ? file.name.trim().slice(0, 100) : null;

  return { ok: true, name, data: { canvas: parsed.data.canvas, blocks }, warnings };
}
