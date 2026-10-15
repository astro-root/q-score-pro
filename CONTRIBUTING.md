# Q-Score Pro 要件定義書（開発引き継ぎ用）

版数: v1.0 ／ 作成日: 2026-10-15 ／ 対象: q-score-pro-main.zip（リポジトリ一式）

## 1. 本書の目的と位置づけ

本書は、Q-Score Pro の開発を別の開発者へ引き継ぐために、プロダクトの目的・設計原則・現在の実装範囲・残課題・今後の開発要件を一箇所にまとめたものです。

根拠資料は次の3つです。

- Q-Score\_Pro\_Develop\_Prompt.md（元仕様。全59章。以下「元仕様」）
- リポジトリのコード・マイグレーション（0001〜0009）の静的確認
- Q-Score-Pro\_総合レビュー.md（既存のコードレビュー。以下「レビュー」）

**重要な注意**

- README.md の開発フェーズ表記は古く、「Phase 1のみ完了」となっているが、実際は Phase 2〜8 相当のコードが存在する。実装状況は本書「4. 機能要件と実装状況」を正とすること。
- 本書の作成にあたり、アプリを実際に起動しての動作確認は行っていない。実装状況の「○」は「該当コードの存在を確認した」の意味であり、動作保証ではない。
- レビュー記載の課題は主に静的解析による指摘である。受け入れ前に、実機（特に複数ロール・複数端末）で再現確認すること。

## 2. プロダクト概要と設計原則

### 2.1 目的

Q-Score Pro は、クイズ大会を運営するための無料・統合プラットフォームである。大会ページ作成、エントリー、参加者管理、ペーパークイズ集計、自動組分け、ラウンド管理、早押し得点操作、監査ログ、バックアップ、OBS対応の得点表示画面までを1サービスで完結させる。最大の差別化要素は、主催者自身が得点表示画面をブロック単位で自由に設計できること。

### 2.2 守るべき設計原則（変更時は要合意）

| 原則 | 内容 |
| --- | --- |
| 無料・非依存 | 有料SaaS/APIを必須依存にしない。セルフホスト可能な構成を維持する |
| 本番品質 | 数十〜数百人、複数ラウンド、複数スタッフ同時操作を前提とする |
| 優先順位 | 正確性 > データ整合性 > 本番信頼性 > 操作速度 > 拡張性 > セキュリティ > UX > 保守性 |
| 概念の分離 | profiles（アカウント）/ tournament\_members（スタッフ）/ participants（参加者）/ entries（応募）を統合しない |
| イベントソーシング | 得点は score\_events の追記専用ログ。現在値はイベントから再計算。Undoは削除でなく voided\_at |
| ルールはデータ | ルールは rounds.rule\_config（jsonb）で表現し、コードにハードコードしない |
| ルールと表示の分離 | src/lib/rules・scoring と src/lib/display・components/display は相互に依存させない |
| 権限の二重化 | 権限は APIルート（can()）と DB（RLS）の両方で検証する。大会間のデータ分離は絶対条件 |

## 3. 技術構成・開発環境

| 項目 | 内容 |
| --- | --- |
| フロント/サーバ | Next.js 16（App Router）、React 19、TypeScript、Tailwind CSS v4 |
| バックエンド | Supabase（PostgreSQL、Auth、Realtime、RLS） |
| バリデーション/テスト | zod、Vitest（単体テスト約71件） |
| 実行環境 | Node.js 20+、GitHub Codespaces（.devcontainer）、ローカルSupabaseはDockerが必要 |
| 運用先 | 公開URL例: https://q-score-pro.astro-root.com/ 。将来は Root's Laboratory でホスティング予定 |

**環境変数**（.env.local。zipには含まれず、.env.local.example のみ同梱）

- NEXT\_PUBLIC\_SUPABASE\_URL
- NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY
- SUPABASE\_SERVICE\_ROLE\_KEY（サーバー専用。RLSを迂回するため、現在はスタッフ招待時のメール検索のみに使用）

**スクリプト**: setup.sh（初期構築）、dev.sh（開発サーバー）、test.sh（型チェック→ESLint→Vitest）、seed.sh（サンプルアカウント・大会投入）、reset.sh。サンプルアカウントは owner@example.com / password1234 で、開発用途限定。本番では使用しないこと。

**注意**: AGENTS.md に「このNext.jsは学習データと異なる破壊的変更を含む。node\_modules/next/dist/docs/ を参照すること」とある。Next.js 固有のAPIを書く前に必ず確認すること。

## 4. 機能要件と実装状況

凡例: ○=コードの存在を確認 ／ △=一部のみ ／ ×=実装を確認できず

| ID | 機能 | 状況 | 現状と備考 |
| --- | --- | --- | --- |
| FR-01 | 認証（登録・ログイン・ログアウト） | ○ | Supabase Auth。サーバー側で毎回 getUser() により再検証 |
| FR-02 | 大会管理・ステータス遷移 | ○ | DRAFT→REGISTRATION\_OPEN→REGISTRATION\_CLOSED→RUNNING→FINISHED→PUBLISHED。PUBLISHEDからの復帰・中止状態なし |
| FR-03 | スタッフ管理 | △ | 招待・一覧のみ。削除・ロール変更のAPI/UIなし（membersルートは GET/POST のみ確認） |
| FR-04 | 大会CMS・公開ページ（/t/\[slug\]） | ○ | 基本情報、お知らせ、スケジュール、ルール等。ルール欄はプレーンテキスト表示 |
| FR-05 | エントリー | ○ | 項目を大会ごとに設定、公開フォーム（/t/\[slug\]/entry）、一覧・検索・CSV出力。編集機能は要確認 |
| FR-06 | 参加者管理 | ○ | 一覧・更新、エントリーからの取込。状態は ACTIVE/DISQUALIFIED/ABSENT/WITHDRAWN |
| FR-07 | ステージ・ラウンド | ○ | stages と rounds（PAPER/BUZZER）。ラウンド状態遷移はアプリとDBトリガーの二重検証 |
| FR-08 | ペーパークイズ | ○ | 素点入力、順位、同点処理、通過人数のカットライン（境界の同点者は全員通過）。問題単位の採点は未対応 |
| FR-09 | 自動組分け | △ | 蛇行（snake）配分と特定参加者の分離制約を確認。手動修正の画面は要確認 |
| FR-10 | 汎用ルールエンジン | ○ | RuleConfig（正解点・誤答減点・スルー・誤答上限・自動失格・勝ち条件・順位点）。純粋関数＋単体テストあり |
| FR-11 | 早押し得点操作画面 | ○ | 正解(C)/誤答(X)/スルー(T)/失格(D)、数字キーで選択、←→/N/Pで問題移動、Ctrl+Zで取消、?でショートカット一覧 |
| FR-12 | Undo・監査ログ | ○ | score\_events.voided\_at、audit\_logs、監査ログ画面とAPI |
| FR-13 | リアルタイム同期 | ○ | Supabase Realtime（postgres\_changes）。操作画面とOBS画面が購読 |
| FR-14 | カスタム表示エンジン | △ | ブロックは TEXT/IMAGE/SHAPE/PLAYER\_CARD/RANKING\_LIST/SCOREBOARD の6種。{{token}}は安全なホワイトリスト方式で9種。レイアウトの保存・複製あり。JSONインポート/エクスポートは確認できず。表示状態切替・アニメーション・問題文/タイマー等のブロックは未実装 |
| FR-15 | OBS Browser Source | ○ | /obs/\[layoutId\]。認証不要の読み取り専用公開（RLSで DRAFT 大会は除外） |
| FR-16 | データエクスポート | △ | 大会JSON一括（/export）とエントリーCSV。表示レイアウトが含まれていない |
| FR-17 | 一般公開（スマホ向け）順位・結果画面 | × | /t/\[slug\] は大会情報とエントリー導線のみ |
| FR-18 | 問題管理（Question） | × | questions テーブルなし。問題番号の進行のみ（rounds.current\_question\_number） |
| FR-19 | チーム戦・Match | × | 未実装 |
| FR-20 | トップのランディングページ | × | / は /login または /dashboard へリダイレクトするのみ |

## 5. データモデル

全テーブルでRLS有効。マイグレーションは supabase/migrations/0001〜0009。src/types/database.ts は手書き（supabase gen types への置換が未了）。

| テーブル | 役割 |
| --- | --- |
| profiles | ユーザーアカウント |
| tournaments | 大会（slug、ステータス、CMS項目） |
| tournament\_members | 大会スタッフとロール |
| announcements / schedule\_items | お知らせ / スケジュール |
| entry\_form\_fields / entries | 応募フォーム定義 / 応募データ（answers を含む） |
| participants | 管理対象の参加者（entry\_id は任意の参照） |
| stages / rounds | 段階 / ラウンド（rule\_config、current\_question\_number を含む） |
| round\_participants | ラウンド別の得点・順位・通過・組・正誤数・失格・勝ち抜け（再計算値のキャッシュ） |
| score\_events | 得点イベントの追記専用ログ（CORRECT/WRONG/THROUGH/MANUAL\_ADJUST/DISQUALIFY/REINSTATE） |
| audit\_logs | 監査ログ |
| display\_layouts | 表示レイアウト（data jsonb に canvas と blocks） |

## 6. 権限要件

権限マトリクスは src/lib/permissions/index.ts の ROLE\_ACTIONS（データテーブル）で定義。新ロール・新アクションはここに追加する。

| ロール | 許可される操作 |
| --- | --- |
| OWNER | 全操作（大会削除を含む） |
| ADMIN | 大会削除以外の全操作 |
| QUESTION\_MANAGER | 問題管理、閲覧 |
| SCORE\_OPERATOR | 得点操作、閲覧 |
| GRADER | ペーパークイズ採点、閲覧 |
| STREAM\_OPERATOR | 配信管理、閲覧 |
| VENUE\_STAFF / VIEWER | 閲覧のみ |

**要件**: 上記の許可・禁止は、APIルートだけでなくDB（RLS）でも同一に成立すること。現状は一致していない（8章 R-02, R-03）。

## 7. 非機能要件

| 区分 | 要件 |
| --- | --- |
| データ整合性 | 同時操作で画面上の得点が実際のイベントと食い違わないこと。再読み込みで得点が消えないこと |
| セキュリティ | 大会間のデータ分離、XSS（dangerouslySetInnerHTML不使用を維持）、CSRF、権限昇格対策、公開ページから管理情報が取れないこと |
| 性能 | 数百人規模・数百イベントでも得点操作が体感遅延なく動作すること。Realtime接続数を抑えること |
| コスト | Supabase無料枠で運用可能であること。公開APIへの濫用で枠を食い潰されないこと |
| 可用性・復旧 | 大会データを機械可読形式で完全に書き出せること。誤操作はUndoで復旧できること |
| 操作性 | 得点操作はキーボードのみで可能。失敗時は必ず画面にエラーを表示すること |

## 8. 修正要件（既知の課題）

レビューの指摘のうち、実装時に確認できたものを要件化する。Issue番号はレビューのものに対応する。

### 8.1 最優先（本番投入前に必須）

| ID | 内容 | 受け入れ条件 |
| --- | --- | --- |
| R-01 | CSV数式インジェクション対策（Issue 3）。entries/export の csvEscape が先頭の = + - @ タブ 改行 を処理していない。共通ユーティリティ化する | `=1+1` を含む応募データをCSV出力すると、先頭に `'` が付いた文字列になる（単体テスト） |
| R-02 | SCORE\_OPERATOR が「次問題へ」を実行できない（Issue 1）。rounds の更新RLSが管理者限定のため。専用RPC化、または問題番号の別テーブル化（Issue 8）で解消する。あわせて recordEvent / undo / moveQuestion が応答を検査せず失敗を無視している点を修正する | SCORE\_OPERATOR で問題番号が実際に進む。失敗時は画面にエラーが出る（E2E） |
| R-03 | round\_participants / score\_events の書き込みRLSがロール粒度なし（Issue 6）。VIEWER でも PostgREST 直叩きで改ざん可能な構造 | VIEWER のJWTによる直接書き込みがDBで拒否される。ROLE\_ACTIONS と RLS の対応をテストで担保する |
| R-04 | 得点再計算のレース条件（Issue 2）。recomputeRoundParticipants が read-modify-write で排他なし | INSERT→再計算→UPSERTをPostgres関数にまとめ、ラウンド単位の pg\_advisory\_xact\_lock で直列化。並行POST（Promise.all）後に全イベントが反映される |

R-02〜R-04 は同じ領域（RLSとRPC）のため、まとめて設計・実装するのが効率的。

### 8.2 次点（運用安定化）

| ID | 内容 | 受け入れ条件 |
| --- | --- | --- |
| R-05 | 公開エントリーAPIのレート制限と重複防止（Issue 4） | (tournament\_id, email) の重複が拒否または警告される。短時間の大量送信が制限される |
| R-06 | スタッフの削除・ロール変更（Issue 5）。DBのRLSは用意済みで、API/UIが未実装 | ADMIN以上が変更・削除できる。OWNERの削除・降格は不可 |

### 8.3 リリース前

| ID | 内容 |
| --- | --- |
| R-07 | entry\_form\_fields の公開SELECTに status <> 'DRAFT' を追加（Issue 7） |
| R-08 | 大会ステータスに、公開後の訂正（PUBLISHED→RUNNING、監査ログ必須）と CANCELLED を追加（Issue 9） |
| R-09 | セキュリティヘッダー（X-Frame-Options、Referrer-Policy、可能ならCSP）の追加（Issue 13） |
| R-10 | エントリー検索で、PostgREST の予約文字（カンマ・括弧）を含む検索語を安全に扱う（Issue 14） |

### 8.4 将来対応

ランディングページ新設（Issue 11）、ルール欄のMarkdown描画または「プレーンテキスト」の明記（Issue 12）、スタッフ招待のユーザー列挙対策（Issue 10）、画像URLの形式検証（Issue 16）、rounds の責務分割（Issue 8）、再計算のスナップショット化（イベント数増加時）。

## 9. 追加開発要件

### 9.1 すぐに着手すべき整備項目（本調査で確認）

| ID | 内容 |
| --- | --- |
| D-01 | README のフェーズ表記を実装実態に合わせて更新する（Issue 15） |
| D-02 | scripts/simulate-tournament.ts は `npm run simulate` での実行を案内しているが、package.json にスクリプト定義がない。定義を追加し、動作確認する |
| D-03 | /export のバックアップに display\_layouts を含める（現状はコメントで「今後追加」とあるのみ） |
| D-04 | src/types/database.ts を supabase gen types の出力に置き換える |

### 9.2 元仕様に対する未実装・不足機能

| ID | 内容 | 元仕様 |
| --- | --- | --- |
| D-05 | 表示レイアウトのJSONインポート/エクスポート（大会間の再利用） | 24, 50章 |
| D-06 | 表示状態（待機中/問題表示中/正解/誤答/スルー/結果/終了）ごとの見た目切替、必要最小限のアニメーション | 23章 |
| D-07 | 追加ブロック（問題文、問題番号、残り問題数、残り時間、ステータス等）と、フォント・行間・余白などのスタイル項目 | 18, 20章 |
| D-08 | 問題管理（Question）と問題文・解答の表示連携 | 34章 |
| D-09 | 一般公開のスマホ向け順位・結果・進行画面（優先度はOBSより低い） | 27章 |
| D-10 | 時間制ルール（TIME\_LIMIT）の実運用（タイマー管理）。型は存在するが画面側の対応は要確認 | 15章 |
| D-11 | チーム戦、Match、Advancement（通過情報）の正式なデータモデル化 | 15, 34章 |
| D-12 | 手動での組修正UIの有無を確認し、不足していれば追加 | 14章 |
| D-13 | 全エクスポートのCSV対応（現状はJSON一括とエントリーCSVのみ） | 31章 |

## 10. 推奨開発順序

1. 整備（D-01, D-02）と、実機でのロール別・複数端末での再現確認（R-02, R-04）
2. R-01（即時・低コスト）
3. R-02〜R-04（RLS見直しとRPC化を一括で）
4. R-05, R-06
5. R-07〜R-10、D-03, D-04
6. 表示エンジン拡張（D-05〜D-07）
7. D-08〜D-13、ランディング、公開画面

## 11. テストと受け入れ基準

**現状**: Vitest による単体テスト（権限、ステータス遷移、ラウンド遷移、ルールエンジン、順位、組分け、表示バインディング）。DB・API・E2Eのテストはなし。

**追加要件**

- RLSテスト（pgTAP、または各ロールのJWTでPostgRESTを直接呼ぶ統合テスト）
- 並行書き込みテスト（R-04）
- Playwright等によるE2E（SCORE\_OPERATOR での得点操作、OBS表示、リロード後の復元）
- simulate-tournament（50人→32人→4組→16人→8人→決勝）を再実行可能にし、CIで回す
- 各修正要件（R-xx）の受け入れ条件を自動テストとして残す

**完了の定義**: 元仕様57章の機能が動作し、8.1の全項目が解消され、実機で複数ロール・複数端末の同時操作を検証済みであること。

## 12. 引き継ぎ時の注意と未確認事項

- 本番のSupabase接続情報（URL・キー）はzipに含まれない。別経路で安全に共有すること。service role key は共有範囲を最小にする。
- 本番サイトでログイン後の動作（ダッシュボード、得点操作、OBS、モバイル表示）は、これまで実機確認されていない。
- 未確認: エントリーの編集機能、組分けの手動修正、レイアウトエディタのドラッグ操作とリサイズ、時間制ルールの画面対応。
- Supabaseの無料枠（Realtime同時接続数、行数、帯域）が大会規模に足りるかは、運用前に見積もること。
- 元仕様（Develop\_Prompt.md）は設計判断の根拠として有用。迷ったら元仕様の優先順位（2.2）に従うこと。
