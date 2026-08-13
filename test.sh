#!/usr/bin/env bash
# 型チェック・Lint・単体テストを一括実行する。
set -euo pipefail
cd "$(dirname "$0")"

echo "== 型チェック =="
npx tsc --noEmit

echo
echo "== ESLint =="
npx eslint .

echo
echo "== 単体テスト (vitest) =="
npx vitest run

echo
echo "全てのチェックが完了しました。"
