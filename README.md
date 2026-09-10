# Q-Score Pro

**クイズ大会を運営するための無料・統合プラットフォーム。**
早押しクイズの得点表示だけでなく、大会ページ作成・エントリー・参加者管理・ペーパークイズ集計・
自動組分け・ラウンド管理・リアルタイム得点操作・監査ログ・自由にレイアウトできる得点表示画面(OBS対応)まで、
本番のクイズ大会で実際に使える品質を目指しています。

> このプロジェクトは大規模なため、フェーズを分けて実装しています。
> 現在の実装状況は [開発フェーズ](#開発フェーズ) を参照してください。

---

## 技術スタック

- Next.js 16 (App Router) / TypeScript / React 19
- Tailwind CSS v4
- Supabase (PostgreSQL / Auth / Realtime / Row Level Security)
- Vitest (単体テスト)

`next/font/google` は使用していません(オフライン・制限ネットワーク環境でのビルドを壊さないため)。
システムフォントスタックを使用しています。

---

## 1. Codespaces での起動

このリポジトリを GitHub Codespaces で開くと、`.devcontainer/devcontainer.json` により
Node.js 20 + Docker (Docker-in-Docker) 環境が自動的に構築され、`postCreateCommand` として
`bash setup.sh` が自動実行されます。

手動で行う場合は以下の手順です。

```bash
bash setup.sh
```

これで以下が行われます。

1. `npm install`
2. `.env.local` の作成 (`.env.local.example` からコピー)
3. Supabase CLI の利用可否確認
4. Docker が使える場合、ローカル Supabase の起動を試行 (`npx supabase start`)
5. マイグレーション適用方法の案内表示

---

## 2. 必要な環境変数

`.env.local` に以下を設定してください(`.env.local.example` を参照)。

| 変数名 | 説明 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクトの URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase の anon (public) キー |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase の service_role キー。**サーバー専用**。ブラウザに絶対に露出させない |

### リモートの Supabase プロジェクトを使う場合

1. https://supabase.com/dashboard で無料プランのプロジェクトを作成
2. Project Settings > API から URL / anon key / service_role key を取得し `.env.local` に設定
3. マイグレーションを適用:
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

### ローカル Supabase を使う場合 (Docker 必須)

```bash
npx supabase start
```

起動後に表示される `API URL` / `anon key` / `service_role key` を `.env.local` に反映してください。
マイグレーションは起動時に自動適用されます。

---

## 3. setup.sh の実行

上記の通り `bash setup.sh` を実行してください。既存の `.env.local` がある場合は上書きされません。

---

## 4. 開発サーバー起動

```bash
bash dev.sh
# または
npm run dev
```

`http://localhost:3000` にアクセスします。未ログインの場合は `/login` にリダイレクトされます。

---

## 5. 初期アカウント作成

トップページの「新規登録」からアカウントを作成できます。
または、後述の `seed.sh` でサンプルオーナーアカウント (`owner@example.com` / `password1234`) を作成できます。

---

## 6. サンプル大会の確認

```bash
bash seed.sh
```

サンプルオーナーアカウントと、そのアカウントが OWNER を務めるサンプル大会
「第1回 サンプルオープン」(`sample-open-1`) が作成されます。
`owner@example.com` / `password1234` でログインし、ダッシュボードから確認できます。

---

## 7. テスト実行

```bash
bash test.sh
```

型チェック (`tsc --noEmit`) → ESLint → Vitest による単体テストを順に実行します。
個別に実行する場合は `npm run test` / `npm run test:watch` も使用できます。

---

## 8. 本番デプロイ方法

Q-Score Pro は特定のホスティングサービスに依存しない設計を意識していますが、
Next.js アプリとして以下のような構成でデプロイできます。

1. **アプリケーション**: Vercel / Cloudflare / 自前の Node サーバーなど、Next.js の
   App Router (Route Handlers, Server Actions, Middleware/Proxy) が動く環境であればどこでも可。
   `npm run build && npm run start` で自前ホスティングも可能です。
2. **Supabase**: 無料枠のホスティング型 Supabase、またはセルフホスト版 Supabase
   (Docker Compose 構成) のどちらでも動作する想定です。
3. デプロイ先の環境変数に `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
   `SUPABASE_SERVICE_ROLE_KEY` を設定してください。
4. `npx supabase db push` で本番プロジェクトにマイグレーションを適用してください。

---

## 9. データバックアップ方法

現時点 (Phase 1) では、バックアップは Supabase 側の機能に依拠します。

- Supabase ダッシュボードの Database > Backups (マネージドプランの場合)
- 手動: `npx supabase db dump` で任意のタイミングでスキーマ・データをダンプ可能

大会データ全体(スタッフ・エントリー・得点イベント・監査ログ・表示レイアウト等)を
JSON/CSV でエクスポートするアプリ内機能は、マスタープロンプート仕様書の Phase 6 で実装予定です。

---

## 開発フェーズ

マスタープロンプートの `# 53. 開発フェーズ` に基づき、以下の順で実装します。

- [x] **Phase 1**: プロジェクト基盤 / 認証 / ユーザー(profiles) / 大会(tournaments) / 権限(tournament_members, RLS, 権限マトリクス)
- [ ] Phase 2: 大会CMS / 公開ページ / エントリー
- [ ] Phase 3: 参加者 / ペーパークイズ / 順位 / 組分け
- [ ] Phase 4: Stage / Round / Group / ルールエンジン
- [ ] Phase 5: ScoreEvent / 早押し得点操作 / リアルタイム同期
- [ ] Phase 6: 監査ログ / Undo / 復旧 / バックアップ
- [ ] Phase 7: カスタム表示エンジン / レイアウトエディタ / ブロック / データバインディング
- [ ] Phase 8: OBS / 公開リアルタイム画面
- [ ] Phase 9: テスト強化 / 負荷検証 / セキュリティ / UX改善

### Phase 1 で実装したもの

- `profiles` (User) と `tournament_members` (大会スタッフ) の分離設計。
  `participants` (大会参加者) は将来のマイグレーションで別テーブルとして追加予定 —
  同一概念として扱わない、という設計方針をスキーマレベルで担保しています。
- 大会ごとのデータ分離を Row Level Security で実装 (`supabase/migrations/0001_init.sql`)。
  スタッフでない大会のデータは一切参照できません。
- ロール(`OWNER` / `ADMIN` / `QUESTION_MANAGER` / `SCORE_OPERATOR` / `GRADER` /
  `STREAM_OPERATOR` / `VENUE_STAFF` / `VIEWER`)ごとの権限をデータテーブルとして定義
  (`src/lib/permissions/index.ts`)。バックエンド API ルートでも必ず検証しています。
- 大会のステータス遷移 (`DRAFT → REGISTRATION_OPEN → ... → PUBLISHED`) を
  許可された遷移のみに制限 (`src/lib/tournament/status.ts`、単体テスト付き)。
- 認証(サインアップ/ログイン/ログアウト)、大会作成・一覧・詳細ダッシュボード、
  スタッフ招待・一覧 UI。

### 技術選定に関する変更点

マスタープロンプートの第一候補技術スタック (Next.js / TypeScript / React / Tailwind /
shadcn/ui / Supabase) を基本的にそのまま採用しています。**shadcn/ui はまだ未導入**です
(Phase 1 は素の Tailwind クラスで実装、UI コンポーネント基盤は Phase 2 以降で shadcn/ui を
導入予定)。理由: Phase 1 の画面数が少なく、コンポーネントライブラリを先に整えるより
データモデル・権限・RLS を固めることを優先したためです。

---

## ディレクトリ構成 (抜粋)

```
supabase/
  migrations/0001_init.sql   -- DBスキーマ・RLSポリシー
  config.toml                -- ローカルSupabase設定
  seed/                      -- (予約: SQLベースのseedを追加する場合)
scripts/
  seed.ts                    -- サンプルアカウント・サンプル大会投入スクリプト
src/
  app/
    (auth)/login, signup     -- 認証画面
    (dashboard)/             -- 認証必須の管理画面
    api/tournaments/         -- 大会・スタッフAPI (Route Handlers)
  lib/
    supabase/                -- client/server/middleware用Supabaseクライアント
    auth/                    -- 現在ユーザー・大会内ロール取得、認証Server Actions
    permissions/              -- ロール×アクションの権限マトリクス
    tournament/               -- 大会ステータス遷移ルール
  types/database.ts          -- Supabase Database型 (手書き。将来 supabase gen types に置換)
tests/unit/                  -- Vitest単体テスト
```

---

## セキュリティに関する注意

- `SUPABASE_SERVICE_ROLE_KEY` は Row Level Security を完全にバイパスします。
  現在はスタッフ招待時のメールアドレス検索 (`profiles` を email で引く) のみに限定して使用しています。
  新しい用途で service role を使う場合は、認可判定を別途必ず実装してください。
- 大会間のデータ分離は RLS ポリシーが最終防衛線です。API ルート側の権限チェック
  (`can()`) は「早く綺麗な403を返す」ためのものであり、RLS の代わりにはなりません。
  新しいテーブルを追加する際は必ず RLS を有効化し、ポリシーを書いてください。
