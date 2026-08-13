#!/usr/bin/env bash
# =============================================================================
# Q-Score Pro : setup.sh
#
# 目的: `bash setup.sh` だけで開発を始められる状態にする。
#   - 依存関係インストール
#   - .env.local の用意(値の入力はユーザーが行う)
#   - Supabase CLI のセットアップ案内 / ローカルSupabase起動(可能な場合)
#   - マイグレーション適用
#   - seedデータ投入
#
# 前提: Node.js 20+, npm。Supabase CLIが無ければ自動インストールを試みる。
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

echo "== [1/5] Node.js の依存関係をインストール =="
npm install

echo
echo "== [2/5] 環境変数ファイルを準備 =="
if [ ! -f .env.local ]; then
  cp .env.local.example .env.local
  echo "  -> .env.local を作成しました。Supabaseプロジェクトの値を入力してください。"
else
  echo "  -> .env.local は既に存在するのでスキップします。"
fi

echo
echo "== [3/5] Supabase CLI の確認 =="
if command -v supabase >/dev/null 2>&1; then
  echo "  -> Supabase CLI は既にインストールされています。"
else
  echo "  -> Supabase CLI が見つかりません。npx経由で利用します(グローバルインストールは行いません)。"
fi

echo
echo "== [4/5] ローカルSupabaseの起動を試みます (Docker が必要です) =="
if command -v docker >/dev/null 2>&1; then
  if npx --yes supabase start 2>&1; then
    echo "  -> ローカルSupabaseを起動しました。'npx supabase status' で接続情報を確認できます。"
    echo "  -> .env.local の NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY を"
    echo "     上記の出力値に置き換えてください。"
  else
    echo "  -> ローカルSupabaseの起動に失敗しました。リモートのSupabaseプロジェクトを"
    echo "     使う場合はこのステップは無視して構いません。"
  fi
else
  echo "  -> Docker が見つからないため、ローカルSupabaseの自動起動はスキップします。"
  echo "     Codespaces に Docker が無い場合は、リモートのSupabaseプロジェクトを"
  echo "     https://supabase.com/dashboard で作成し、.env.local に値を設定してください。"
fi

echo
echo "== [5/5] マイグレーションの適用について =="
echo "  リモートプロジェクトの場合: npx supabase link --project-ref <project-ref> の後、"
echo "                              npx supabase db push"
echo "  ローカルの場合          : npx supabase start で自動的にマイグレーションが適用されます"
echo
echo "セットアップの主要ステップが完了しました。"
echo "  - 開発サーバー起動:   bash dev.sh"
echo "  - テスト実行:         bash test.sh"
echo "  - シードデータ投入:   bash seed.sh"
echo "詳細は README.md を参照してください。"
