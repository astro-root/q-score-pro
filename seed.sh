#!/usr/bin/env bash
# サンプルオーナーアカウント + サンプル大会を投入する。
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env.local ]; then
  echo "エラー: .env.local が見つかりません。先に 'bash setup.sh' を実行してください。" >&2
  exit 1
fi

set -a
source .env.local
set +a

npx tsx scripts/seed.ts
