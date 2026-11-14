/**
 * PostgREST の .or() フィルタ文字列を安全に組み立てるためのヘルパー。
 *
 * 検索語をテンプレートリテラルで直接埋め込むと、カンマや括弧が
 * フィルタ構文の区切りとして解釈され、検索が壊れる(500になる)。
 * 対策は2段階:
 *   1. LIKE のワイルドカード (% _ ) とエスケープ文字 (\) をエスケープする
 *   2. 値全体をダブルクォートで囲み、中の " と \ をバックスラッシュでエスケープする
 *      (PostgREST の「予約文字を含む値は二重引用符で囲む」規則)
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

export function quotePostgrestValue(input: string): string {
  return `"${input.replace(/[\\"]/g, "\\$&")}"`;
}

const ENTRY_SEARCH_COLUMNS = ["display_name", "email", "affiliation"] as const;

/** エントリーの部分一致検索(表示名・メール・所属のいずれか)用の .or() 文字列。 */
export function buildEntrySearchFilter(term: string): string {
  const pattern = quotePostgrestValue(`%${escapeLikePattern(term)}%`);
  return ENTRY_SEARCH_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(",");
}
