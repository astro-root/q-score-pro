#!/usr/bin/env bash
# Phase 3b (大会ホームページ CMS・結果公開) を、ブランチ作成 → DB適用 → 型再生成 → 検証 → main へマージ & push。
# 使い方: ダウンロードした phase3b.patch と、このファイルを同じ場所に置いて  bash ship-phase3b.sh
set -euo pipefail

REPO=~/q-score-pro
HERE="$(cd "$(dirname "$0")" && pwd)"

PATCH=""
for c in "$HERE/phase3b.patch" ~/qsp-patches/phase3b.patch ~/Downloads/phase3b.patch "$REPO/phase3b.patch"; do
  [ -f "$c" ] && { PATCH="$c"; break; }
done
[ -n "$PATCH" ] || { echo "ERROR: phase3b.patch が見つかりません。このスクリプトと同じフォルダに置いてください" >&2; exit 1; }
mkdir -p ~/qsp-patches
case "$PATCH" in "$REPO"/*) mv "$PATCH" ~/qsp-patches/phase3b.patch; PATCH=~/qsp-patches/phase3b.patch ;; esac
echo "パッチ: $PATCH"

cd "$REPO"
[ -f package.json ] && [ -d src/app ] || { echo "ERROR: $REPO がリポジトリではありません" >&2; exit 1; }
[ "$(git branch --show-current)" = "main" ] || { echo "ERROR: main ではありません" >&2; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo "ERROR: 未コミットの変更があります" >&2; exit 1; }
git fetch origin
git merge-base --is-ancestor origin/main main || { echo "ERROR: main が origin/main から分岐しています" >&2; exit 1; }
[ "$(git rev-parse main)" = "$(git rev-parse origin/main)" ] || { echo "ERROR: main に未pushのコミットがあります。先に push してください" >&2; exit 1; }
[ -f supabase/migrations/0015_entry_window_auto_register.sql ] \
  || { echo "ERROR: Phase 3a (0015) が main にありません。先に ship-phase3a.sh を実行してください" >&2; exit 1; }

git switch -c feature/phase3b-public-page
echo "== 衝突チェック(失敗してもファイルは変更されません) =="
patch --batch -p1 --dry-run < "$PATCH" >/dev/null
patch --batch -p1 < "$PATCH"
find . -name '*.orig' -not -path './node_modules/*' -delete

echo "== 1/5 DB dry-run(本番には変更を加えません) =="
OUT="$(npx --yes supabase db push --remote --dry-run 2>&1)" || { echo "$OUT"; echo "ERROR: dry-run に失敗" >&2; exit 1; }
echo "$OUT"
PENDING="$(printf '%s\n' "$OUT" | grep -oE '[0-9]{4}_[A-Za-z0-9_]+\.sql' | sort -u | tr '\n' ' ')"
[ "$PENDING" = "0016_public_page_results.sql " ] \
  || { echo "ERROR: 適用予定が 0016 だけではありません: [${PENDING}]。何も適用していません" >&2; exit 1; }

echo "== 2/5 本番DBへ適用(確認プロンプトが出たら y) =="
echo "   ※ 0015 の受付期間の列(entry_opens_at/closes_at)を、既存の entry_starts_at/ends_at に統合します。"
echo "     受付中なのに期間外の大会があれば、適用時に NOTICE として表示されます(その大会は受付が止まります)。"
npx --yes supabase db push --remote

echo "== 3/5 型を実スキーマから再生成して検証 =="
bash scripts/gen-types.sh
npx tsc --noEmit
npm run lint
npm test
npm run build

git add -A
git commit -m "feat(public): tournament page CMS - Markdown, JST, entry status, published results

- migration 0016: unify entry window onto entry_starts_at/entry_ends_at (drop 0015 duplicate columns)
  tournaments.show_entry_count, rounds.results_public
  SECURITY DEFINER public_entry_count / public_tournament_results (fixed columns, PUBLISHED only)
- public page: explicit column list (no owner_id leak), JST dates, window-aware entry CTA,
  Markdown (no raw HTML, http/https/mailto links only), results tables, in-page nav, mobile layout
- CMS: JST datetime inputs, http(s)-only image URLs, entry count toggle, public/private badge
- round detail: results publish toggle; schedule editor uses JST
- tests: markdown parser / XSS safety"

echo "== 4/5 main にマージ =="
git switch main
git merge --no-ff feature/phase3b-public-page -m "Merge feature/phase3b-public-page"
echo "== 5/5 push =="
git push origin main
echo "完了: Phase 3b を main に反映しました"
