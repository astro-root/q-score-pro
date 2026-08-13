#!/usr/bin/env bash
# ローカルSupabaseのDBをマイグレーションから作り直し、サンプルデータを再投入する。
# リモートのSupabaseプロジェクトに対しては実行しないこと(全データが消えます)。
set -euo pipefail
cd "$(dirname "$0")"

read -r -p "ローカルDBを全て初期化します。よろしいですか? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "中止しました。"
  exit 0
fi

npx supabase db reset
bash seed.sh
