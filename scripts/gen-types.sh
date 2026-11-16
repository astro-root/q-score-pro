#!/usr/bin/env bash
# 本番(link 済みのプロジェクト)のスキーマから型を再生成する。
#   bash scripts/gen-types.sh
#
# 失敗したときに既存のファイルを壊さないよう、いったん一時ファイルに出力して、
# 中身を確認してから置き換える(`> file` で直接リダイレクトすると、失敗時に空になる)。
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="src/types/database.generated.ts"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

npx supabase gen types typescript --linked --schema public > "$TMP"

if ! head -n 1 "$TMP" | grep -q "^export type Json"; then
  echo "型の生成に失敗しました(出力が想定の形ではありません)。$OUT は変更していません。" >&2
  head -n 5 "$TMP" >&2
  exit 1
fi

{
  cat <<'HEADER'
/**
 * !! 自動生成ファイル。手で編集しないこと !!
 *
 * Supabase の型生成(supabase gen types)の出力。再生成は:
 *   bash scripts/gen-types.sh
 * アプリ固有の型(jsonb の中身、追記専用テーブル)は src/types/database.ts で重ねている。
 * 画面やAPIからは、このファイルではなく "@/types/database" を import すること。
 */
HEADER
  cat "$TMP"
} > "$OUT"

echo "更新しました: $OUT"
git --no-pager diff --stat -- "$OUT" || true
