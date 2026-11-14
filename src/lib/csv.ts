/**
 * CSV 生成ユーティリティ。
 *
 * エントリー一覧のように「第三者が自由に入力できる値」を CSV に出力する場合、
 * 先頭が = + - @ タブ 改行 の文字列は Excel / Google Sheets に数式として評価される
 * (CSV/数式インジェクション, CWE-1236)。文字列セルの先頭に ' を付けて
 * 文字列として扱わせる(OWASP 推奨の対策)。
 *
 * 数値(number)はそのまま出力する(負の数を壊さないため)。数式として評価される
 * 危険があるのは「文字列」だけなので、無害化の対象は string のみ。
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r\n]/;
const NEEDS_QUOTING = /[",\r\n]/;

export function csvEscape(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);

  if (typeof value !== "number" && FORMULA_TRIGGER.test(s)) {
    s = `'${s}`;
  }

  if (NEEDS_QUOTING.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 行の配列を CSV 文字列にする。先頭に UTF-8 BOM を付け(日本語版 Excel で
 * 文字化けさせないため)、改行は CRLF。
 */
export function buildCsv(rows: unknown[][]): string {
  return "\uFEFF" + rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}
