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

バックアップは Supabase 側の機能に依拠します。

- Supabase ダッシュボードの Database > Backups (マネージドプランの場合)
- 手動: `npx supabase db dump` で任意のタイミングでスキーマ・データをダンプ可能

大会データ全体(スタッフ・エントリー・得点イベント・監査ログ・表示レイアウト等)を
JSON/CSV でエクスポートするアプリ内機能は、マスタープロンプート仕様書の Phase 6 で実装予定です。

---

## 開発フェーズ

マスタープロンプトの `# 53. 開発フェーズ` に基づく実装状況です。
「コードが存在する」ことと「実機で検証済み」は別です。詳細な要件・残課題は
[CONTRIBUTING.md](./CONTRIBUTING.md)(要件定義書)と [codereview.md](./codereview.md) を参照してください。

- [x] **Phase 1**: プロジェクト基盤 / 認証 / ユーザー / 大会 / 権限(RLS・権限マトリクス)
- [x] **Phase 2**: 大会CMS / 公開ページ / エントリー
- [x] **Phase 3**: 参加者 / ペーパークイズ / 順位 / 自動組分け
- [x] **Phase 4**: Stage / Round / ルールエンジン
- [x] **Phase 5**: ScoreEvent / 早押し得点操作 / リアルタイム同期
- [x] **Phase 6**: 監査ログ / Undo / エクスポート(表示レイアウトのバックアップ、全CSV対応は未了)
- [~] **Phase 7**: カスタム表示エンジン(6種のブロック。JSON入出力・表示状態切替・追加ブロックは未実装)
- [x] **Phase 8**: OBS Browser Source / 公開リアルタイム画面(スマホ向け順位表は未実装)
- [ ] **Phase 9**: テスト強化 / 負荷検証 / セキュリティ / UX改善(進行中。下記)

### 直近の変更 (マイグレーション 0010)

- **ロール粒度のRLS**: `round_participants` / `score_events` の書き込みを、
  `ROLE_ACTIONS` と対応するロールだけに限定(VIEWER 等はAPIを経由せず直接叩いても拒否)。
  対応関係は `tests/unit/rls-permissions.test.ts` が検証します。
- **得点操作のRPC化**: `record_score_event` / `undo_last_score_event` /
  `advance_round_question`。SCORE_OPERATOR でも「次問題へ」が実行できます。
- **再計算の排他制御**: `round_score_state.seq` による楽観的排他。複数オペレーターが
  同時に操作しても、古い計算結果が新しい結果を上書きしません。
- **score_events の追記専用化**: 変更できるのは Undo (`voided_at`) のみ。DELETE 不可。
- CSV数式インジェクション対策、エントリー検索の特殊文字対応、セキュリティヘッダー追加。

### 直近の変更 (マイグレーション 0011)

- **エントリーの重複防止 (R-05)**: 同じ大会に同じメールアドレス(大文字小文字・前後の空白は無視)で
  `SUBMITTED` のエントリーが既にあれば拒否します。`WITHDRAWN` なら再エントリー可。同時送信でもすり抜けません。
- **エントリーの流量制限 (R-05)**: 1大会あたり1分間に60件を超える受付を拒否(DBトリガー)。
  さらにAPIで、1IP・1大会あたり10分に30件までに制限します。
- **スタッフの変更・削除 (R-06)**: 大会管理者(ADMIN以上)がロール変更・削除できます
  (`/tournaments/[id]/members`)。OWNER の削除・降格と、自分自身の変更・削除はできません。
  OWNER を新たに付与することもできません(DBトリガーでも強制)。変更は監査ログに残ります。
- DB回帰テスト: `tests/db/0011_entry_guard_and_member_protection.sql`(実行方法はファイル冒頭)。

### 直近の変更 (マイグレーション 0012・0013)

- **公開後の訂正 (R-08)**: 結果公開(PUBLISHED)の大会を、理由つきで開催中(RUNNING)に戻せます。
  公開中の結果は一旦非公開になり、直したあとに再度「結果公開」へ進められます。
- **大会の中止 (R-08)**: ステータスに `CANCELLED`(中止)を追加。受付中・受付締切・開催中から、理由つきで中止できます。
  下書きは公開されたことがないので、中止ではなく削除してください。中止は元に戻せません。
  中止された大会の公開ページは残り、「この大会は中止されました」と表示します。
- **訂正・中止は理由が必須で、監査ログに必ず残ります**。遷移の検証と監査ログの記録は DB トリガーで行うため、
  API を経由しない更新でも同じ検証が効き、「状態は変わったのに監査ログが無い」状態は起きません。
  通常のステータス変更も、監査ログに記録されるようになりました。
- 遷移表は `src/lib/tournament/status.ts`(アプリ)と 0013(DB)の2か所にあります。
  `tests/unit/tournament-status.test.ts` が両者の一致を検証します。
- **バックアップ (D-03)**: `/export` に表示レイアウト(`displayLayouts`)を追加しました(`schemaVersion: 2`)。
- DB回帰テスト: `tests/db/0013_tournament_status_workflow.sql`。

### 直近の変更 (型生成 D-04)

- `src/types/database.generated.ts` は、本番スキーマから生成した型です(手で編集しません)。
  マイグレーションを追加・変更したら、`npm run gen:types`(`bash scripts/gen-types.sh`)で再生成します。
- `src/types/database.ts` は、生成型に次の3つを重ねたものです。画面・APIは `@/types/database` から import します。
  1. jsonb カラムの中身の型(`entries.answers`、`rounds.rule_config`、`display_layouts.data` など)
  2. 追記専用テーブルの更新制限(`audit_logs` は更新不可、`score_events` は取消の記録のみ)
  3. RPC の引数(null を受け付ける引数など。生成器が表せないため)
- アプリの `ScoreEventType` と DB の enum `score_event_type` がずれると、型チェックでエラーになります。

### 直近の変更 (表示レイアウトのJSON入出力 D-05)

- **書き出し**: レイアウト一覧の「書き出し」で、レイアウトをJSONファイルとして保存できます。
- **取り込み**: 一覧の「ファイルを選択」で、書き出したJSONを**新しいレイアウトとして**追加します(既存のレイアウトは上書きしません)。
  大会をまたいだ再利用に使えます。
- 取り込むファイルは外部の入力として検証します(`src/lib/display/layout-io.ts`)。
  形・数値の範囲・文字数、画像URL(http(s) かサイト内パスのみ)、色の書式を確認し、問題があれば理由を示して拒否します。
  他の大会の選手に固定されていたブロックは「1位の選手」に変え、警告を表示します。ブロックIDは振り直します。
- 画像URLは描画側でも同じ基準で確認します(`javascript:` などは表示しません)。
- エディタの保存(PATCH)も同じ検証を通ります。

### 既知の制約

- `round_participants` の得点キャッシュは、得点操作ロール(OWNER/ADMIN/SCORE_OPERATOR)が
  RPC `apply_round_computation` で直接書けます(計算結果をクライアントが渡す設計のため)。
  イベントログ(`score_events`)は追記専用で、次のイベント記録時にキャッシュは再計算されます。
- 未実装の主な要件: 表示状態ごとの見た目の切替(D-06)、表示ブロック・スタイル項目の追加(D-07)。
- エントリーの流量制限(IP単位)はメモリ内のベストエフォートです(サーバーレスでは複数インスタンスに分かれる)。
  DB を直接叩く経路に対しては、大会単位の上限(1分あたり60件)がマイグレーション 0011 のトリガーで効きます。

### シミュレーション

```bash
npm run simulate
```

`.env.local` の接続先に対して、50人 → 32人 → 4組 → 16人 → 8人 → 決勝 の大会を自動実行します
(毎回、新しい大会とアカウントを作成します)。

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
  types/database.generated.ts -- 自動生成 (supabase gen types)。手で編集しない
  types/database.ts          -- アプリで使う Database 型 (生成型 + jsonbの中身・追記専用テーブルの型)
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
