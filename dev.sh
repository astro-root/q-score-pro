#!/usr/bin/env bash
# 開発サーバーを起動する。
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env.local ]; then
  echo "エラー: .env.local が見つかりません。先に 'bash setup.sh' を実行してください。" >&2
  exit 1
fi

npm run dev
