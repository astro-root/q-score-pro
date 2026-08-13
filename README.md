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

大会単位のバックアップは、アプリ内から直接取得できます。

- 大会ダッシュボード、または監査ログ画面 (`/tournaments/[id]/audit-log`) の
  「大会データを全てエクスポート(JSON)」から、大会情報・スタッフ・
  ステージ・ラウンド・参加者・エントリー・得点イベント・監査ログなどを
  含む完全なJSONファイルをダウンロードできます。
- エントリーのみのCSVエクスポートは `/tournaments/[id]/entries` から可能です。

インフラ全体のバックアップ(Supabaseプロジェクト全体)には、以下も利用できます。

- Supabase ダッシュボードの Database > Backups (マネージドプランの場合)
- 手動: `npx supabase db dump` で任意のタイミングでスキーマ・データをダンプ可能

---

## 開発フェーズ

マスタープロンプートの `# 53. 開発フェーズ` に基づき、以下の順で実装します。

- [x] **Phase 1**: プロジェクト基盤 / 認証 / ユーザー(profiles) / 大会(tournaments) / 権限(tournament_members, RLS, 権限マトリクス)
- [x] **Phase 2**: 大会CMS / 公開ページ / エントリー
- [x] **Phase 3**: 参加者 / ペーパークイズ / 順位 / 組分け
- [x] **Phase 4**: Stage / Round / Group / ルールエンジン
- [x] **Phase 5**: ScoreEvent / 早押し得点操作 / リアルタイム同期
- [x] **Phase 6**: 監査ログ / Undo / 復旧 / バックアップ
- [x] **Phase 7**: カスタム表示エンジン / レイアウトエディタ / ブロック / データバインディング
- [x] **Phase 8**: OBS / 公開リアルタイム画面
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

### Phase 2 で実装したもの

- 大会CMS: 大会名・概要・ロゴ・メインビジュアル・開催日時・開催場所・主催者・
  問い合わせ先・ルール・注意事項・エントリー期間・定員を管理画面から編集可能
  (`/tournaments/[id]/cms`)。HTMLを書かなくても大会ページを作成できます。
- お知らせ機能: 投稿・公開/非公開切り替え・削除 (`/tournaments/[id]/announcements`)。
- スケジュール機能: 項目の追加・並べ替え・削除 (`/tournaments/[id]/schedule`)。
- エントリーフォームの動的項目設定: 氏名・メール・所属は標準項目、それ以外は
  大会ごとに自由に追加可能(テキスト/複数行/メール/数値/選択式/チェックボックス)
  (`/tournaments/[id]/entry-fields`)。
- 公開大会ページ (`/t/[slug]`) と 公開エントリーフォーム (`/t/[slug]/entry`):
  認証不要でアクセス可能。エントリーは大会ステータスが `REGISTRATION_OPEN` の間のみ
  RLSレベルで許可されます。
- エントリー一覧・検索(氏名/メール/所属)・ステータス絞り込み・CSVエクスポート
  (`/tournaments/[id]/entries`)。
- `entries`(生の応募データ)と将来追加する `participants`(スクリーニング後の
  管理対象データ)を明確に分離するスキーマ設計。

### Phase 3 で実装したもの

- 参加者管理: 手動追加、エントリー(Phase 2)からのスクリーニング取り込み、
  ステータス管理(有効/失格/欠場/辞退) (`/tournaments/[id]/participants`)。
- ラウンド管理: 作成・状態遷移(未開始→進行中→一時停止/終了、DBトリガーでも
  不正遷移を防止) (`/tournaments/[id]/rounds`)。
- ペーパークイズ得点入力: 参加者ごとの得点をスタッフが入力するだけで、
  順位・同点処理・足切り(通過判定)を自動計算 (`src/lib/scoring/ranking.ts`、
  単体テスト付き)。同着が足切りラインにかかる場合は境界順位の参加者を
  全員通過扱いにし、公平性を優先。
- 自動組分け: 上位から均等配分(スネーク方式)/人数均等/上位グループ丸ごと の
  3方式に対応、特定参加者同士を別グループに分離する制約にも対応
  (`src/lib/scoring/grouping.ts`、単体テスト付き)。自動生成後の手動修正は
  得点表上で今後拡張予定です。
- `participants`(スクリーニング後の管理対象)と将来の `ScoreEvent`(得点イベント、
  Phase 5)を見据え、ラウンドごとの得点は `round_participants.score` を単一の
  現在値として保持しつつ、再計算可能な設計にしています。

### Phase 4 で実装したもの

- ステージ管理: 予選・敗者復活・本戦・準決勝・決勝のような自由な構成を、
  固定の進行グラフではなく「ステージにラウンドを紐付ける」だけのシンプルな
  モデルで表現 (`/tournaments/[id]/stages`)。誰がどのラウンドに進むかは
  スタッフが都度参加者を割り当てる運用(Phase 3のround_participants機能)
  で決まるため、敗者復活のような非線形な構成も無理なく扱えます。
- 汎用ルールエンジン (`src/lib/rules/`): 正解時の得点・誤答時の減点・
  誤答回数上限・失格条件・スルー・勝ち抜け(得点先取)・問題数制・時間制・
  順位点・複数ラウンド合算を、ハードコードではなく `RuleConfig` という
  データ(ラウンドごとに`rule_config` jsonbとして保存)で表現。
  得点は常にイベントの列から再計算する設計にしているため、Undo(操作の
  取り消し)は「イベント列から該当イベントを除いて再計算するだけ」で
  実現できる構造になっています(`evaluateRound`関数、単体テストで
  Undoシナリオも検証済み)。実際のイベント入力UI・DB永続化はPhase 5で
  実装します。
- ラウンド作成・編集画面に得点ルールエディタを統合。

### Phase 5 で実装したもの

- ScoreEventの永続化 (`score_events`テーブル): 追記専用ログとして得点イベントを
  記録。Undoは行の削除ではなく`voided_at`のセットで表現し、監査証跡を維持。
- 早押し得点操作画面 (`/tournaments/[id]/rounds/[roundId]/operate`):
  正解・誤答・スルー・加点・減点・失格/復活をワンタッチで操作可能。
  キーボードショートカット(数字キーで参加者選択、C/X/T/D、Ctrl+Z、
  矢印キーで問題送り、`?`でショートカット一覧表示)に対応。
- リアルタイム同期: Supabase Realtimeで`round_participants`/`rounds`の
  変更を購読し、複数スタッフが同時に操作しても全員の画面が即座に同期される
  設計(RLSはRealtimeペイロードにも適用されるため大会間分離は維持)。
- 得点の再計算 (`src/lib/rules/apply-round-events.ts`): 得点イベントの
  記録・Undoいずれも同じ再計算関数を経由するため、2つの処理でロジックが
  乖離することがない設計。
- ラウンド単位の失格(`round_participants.disqualified`)は、大会全体の
  失格(Phase 3の`participants.status`)とは別概念として設計。

### Phase 6 で実装したもの

- 汎用監査ログ (`audit_logs`テーブル): 得点イベント固有の詳細はPhase 5の
  `score_events`が担い、それ以外の運用上重要な操作(大会ステータス変更・
  スタッフ追加・参加者ステータス変更・ラウンドステータス変更・得点イベントの
  Undo)を「誰が・いつ・どの大会で・どのラウンドで・どの参加者に・何を」の
  形式で記録 (`/tournaments/[id]/audit-log`)。追記専用で、更新・削除は
  行いません。
- 大会データの完全エクスポート (`/api/tournaments/[id]/export`):
  大会情報・スタッフ・ステージ・ラウンド・参加者・エントリー・得点イベント・
  監査ログなどを1つのJSONファイルとして出力。CSVエクスポート(エントリー、
  Phase 2)と合わせて、機械可読なバックアップ形式を用意。
- Undo自体はPhase 5で実装済み(得点イベントの`voided_at`方式)。今回は
  「誰がいつ取り消したか」を監査ログにも記録するよう連携。
- データ復旧(ブラウザ再読み込みしてもデータが消えない)は、そもそも
  全てのデータをSupabase側に永続化し、クライアント側にlocalStorage等の
  一時保存を一切使わない設計(Phase 1からの一貫した方針)によって
  最初から担保されています。

### Phase 7 で実装したもの

- カスタム表示エンジン (`src/lib/display/`): レイアウトは「キャンバス設定 +
  ブロックの配列」という1つのJSONデータ(`DisplayLayoutData`)として
  `display_layouts`テーブルに保存。エクスポート/インポートはこのJSONを
  そのまま読み書きするだけで実現。
- ブロック種類: テキスト・画像・図形・プレイヤーカード・ランキング・
  スコアボードの6種類。各ブロックは位置・サイズ・背景色・文字色・
  文字サイズ・角丸・不透明度などを個別に設定可能。
- データバインディング: `{{tournament.name}}`のようなトークンを、
  evalを一切使わない安全なルックアップテーブル方式で解決
  (`src/lib/display/binding.ts`)。存在しないトークンは実行時エラーに
  せず、そのまま文字として表示するフェイルセーフな設計。単体テストで
  「コードとして実行されないこと」も明示的に検証。
- レイアウトエディタ (`/tournaments/[id]/layouts/[layoutId]`):
  ポインタイベントベースの自作ドラッグ&リサイズ機能でブロックを
  自由に配置。実際のラウンドのデータ、またはサンプルデータでの
  ライブプレビューに対応。
- レイアウトの保存・複製・削除・JSON形式でのエクスポート/インポートに対応。
  大会ごとに複数のレイアウト(Main/Scoreboard/Final/OBS等)を保持可能。
- 表示レンダラー (`src/components/display/DisplayRenderer.tsx`) は
  エディタのプレビューと共通のコンポーネントとして実装し、Phase 8の
  OBS表示画面でもそのまま再利用する設計(ルールエンジンや得点計算とは
  完全に独立したモジュール)。

### Phase 8 で実装したもの

- OBS Browser Source対応の公開表示ページ (`/obs/[layoutId]?round=<roundId>`):
  認証不要・管理UIなしの完全に独立した画面。OBS側は特別なプラグインなしで
  URLをBrowser Sourceに設定するだけで利用可能。
- リアルタイム更新: Supabase Realtimeへの匿名(anonキー)購読で、得点操作
  画面での操作が即座に反映されます。
- 公開アクセスのためのRLS拡張 (`0008_public_display_access.sql`):
  `rounds` / `round_participants` / `participants` / `display_layouts`
  について、大会がDRAFT以外のステータスになった時点でのみ匿名読み取りを
  許可する限定的なポリシーを追加。DRAFT中の大会情報は引き続き完全に
  非公開。得点イベント・監査ログ・エントリー・スタッフ情報など機密性の
  高いデータは一切公開範囲に含めていません。
- レイアウト管理画面からOBS用URLをラウンドごとに生成・コピー可能。

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
