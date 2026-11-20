#!/usr/bin/env bash
# Phase 3a (エントリーフォーム) を、ブランチ作成 → DB適用 → 型再生成 → 検証 → main へマージ & push まで進める。
# 使い方: ダウンロードした phase3a.patch と、このファイルを同じ場所に置いて  bash ship-phase3a.sh
set -euo pipefail

REPO=~/q-score-pro
HERE="$(cd "$(dirname "$0")" && pwd)"

# --- パッチの場所を探す(同じフォルダ → ~/qsp-patches → ~/Downloads → リポジトリ直下) ---
PATCH=""
for c in "$HERE/phase3a.patch" ~/qsp-patches/phase3a.patch ~/Downloads/phase3a.patch "$REPO/phase3a.patch"; do
  [ -f "$c" ] && { PATCH="$c"; break; }
done
[ -n "$PATCH" ] || { echo "ERROR: phase3a.patch が見つかりません。このスクリプトと同じフォルダに置いてください" >&2; exit 1; }
mkdir -p ~/qsp-patches
case "$PATCH" in "$REPO"/*) mv "$PATCH" ~/qsp-patches/phase3a.patch; PATCH=~/qsp-patches/phase3a.patch ;; esac
echo "パッチ: $PATCH"

cd "$REPO"
[ -f package.json ] && [ -d src/app ] || { echo "ERROR: $REPO がリポジトリではありません" >&2; exit 1; }
[ "$(git branch --show-current)" = "main" ] || { echo "ERROR: main ではありません" >&2; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo "ERROR: 未コミットの変更があります" >&2; exit 1; }
git fetch origin
git merge-base --is-ancestor origin/main main || { echo "ERROR: main が origin/main から分岐しています" >&2; exit 1; }
[ "$(git rev-parse main)" = "$(git rev-parse origin/main)" ] || { echo "ERROR: main に未pushのコミットがあります。先に push してください" >&2; exit 1; }

git switch -c feature/phase3a-entry-form
echo "== 衝突チェック(失敗してもファイルは変更されません) =="
patch --batch -p1 --dry-run < "$PATCH" >/dev/null
patch --batch -p1 < "$PATCH"
find . -name '*.orig' -not -path './node_modules/*' -delete

echo "== 1/5 DB dry-run(本番には変更を加えません) =="
OUT="$(npx --yes supabase db push --remote --dry-run 2>&1)" || { echo "$OUT"; echo "ERROR: dry-run に失敗" >&2; exit 1; }
echo "$OUT"
PENDING="$(printf '%s\n' "$OUT" | grep -oE '[0-9]{4}_[A-Za-z0-9_]+\.sql' | sort -u | tr '\n' ' ')"
[ "$PENDING" = "0015_entry_window_auto_register.sql " ] \
  || { echo "ERROR: 適用予定が 0015 だけではありません: [${PENDING}]。何も適用していません" >&2; exit 1; }

echo "== 2/5 本番DBへ適用(確認プロンプトが出たら y) =="
echo "   ※ entries の公開INSERTポリシーを、期間条件つきで作り直します(同一トランザクション内。失敗すれば元のまま)"
npx --yes supabase db push --remote

echo "== 3/5 型を実スキーマから再生成して検証 =="
bash scripts/gen-types.sh
npx tsc --noEmit
npm run lint
npm test
npm run build

git add -A
git commit -m "feat(entry): entry window, auto-register option, field reorder/preview, safe field save

- migration 0015: tournaments.entry_opens_at / entry_closes_at / entry_auto_register
  RLS: public entry insert now also requires the entry window
  trigger: optional auto-creation of participants from new entries (entries != participants)
- entry-fields PUT: upsert then delete leftovers (was delete-all then insert-all: could lose the form)
- editor: move up/down, auto field keys + validation, locked keys for saved fields, live preview
- public form and preview share EntryFieldInput; public page explains closed/not-yet-open in JST
- tests: entry window (JST), field editing helpers"

echo "== 4/5 main にマージ =="
git switch main
git merge --no-ff feature/phase3a-entry-form -m "Merge feature/phase3a-entry-form"
echo "== 5/5 push =="
git push origin main
echo "完了: Phase 3a を main に反映しました"
