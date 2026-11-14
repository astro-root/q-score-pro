#!/usr/bin/env bash
# Q-Score Pro: R-01/R-02/R-03/R-04/R-07/R-09/R-10 + D-01/D-02 適用スクリプト
# リポジトリのルート(package.json がある場所)で実行: bash apply-update.sh
set -euo pipefail
[ -f package.json ] && [ -d src ] && [ -d supabase/migrations ] || { echo "エラー: リポジトリのルートで実行してください" >&2; exit 1; }
[ ! -f supabase/migrations/0010_role_scoped_rls_and_score_rpc.sql ] || { echo "エラー: 0010 は適用済みのようです。中止します" >&2; exit 1; }

echo "write: supabase/migrations/0010_role_scoped_rls_and_score_rpc.sql"
mkdir -p "$(dirname 'supabase/migrations/0010_role_scoped_rls_and_score_rpc.sql')"
cat > 'supabase/migrations/0010_role_scoped_rls_and_score_rpc.sql' <<'QSCORE_EOF'
-- =============================================================================
-- Q-Score Pro : 0010
-- ロール粒度のRLS / 得点操作RPC / 再計算の排他制御 / score_events の追記専用化
--
-- 対応する要件 (CONTRIBUTING.md 8章 / codereview.md):
--   R-02 (Issue 1) SCORE_OPERATOR が「次問題へ」を実行できない
--   R-03 (Issue 6) round_participants / score_events の書き込みRLSにロール粒度がない
--   R-04 (Issue 2) 得点再計算の read-modify-write レース条件
--   R-07 (Issue 7) entry_form_fields の公開SELECTが DRAFT 大会を除外していない
--
-- 設計方針:
-- - 権限の二重化: APIルートの can() と、このマイグレーションのRLS/RPCは
--   同じ ROLE_ACTIONS (src/lib/permissions/index.ts) から導かれる。対応関係は
--   tests/unit/rls-permissions.test.ts がこのファイルを解析して検証する。
--   ヘルパー関数のロール配列を変更したら、ROLE_ACTIONS も必ず同時に直すこと。
-- - 得点の現在値(round_participants)はイベントログからの再計算キャッシュ。
--   再計算ロジック(ルールエンジン)は TypeScript 側の純粋関数に一本化したまま、
--   「イベント書き込み回数のカウンタ(round_score_state.seq)」による楽観的排他で
--   古い計算結果が新しい計算結果を上書きしないことをDBが保証する。
--     1. score_events への INSERT / UPDATE のたびに seq が +1 される(トリガー)
--     2. 再計算側は seq を先に読み、イベントを読み、計算し、
--        apply_round_computation(expected_seq) で書き込む
--     3. expected_seq が現在の seq と違えば書き込みは拒否され(false)、再計算をやり直す
--   seq の更新と apply はどちらも round_score_state 行ロックを取るため直列化される。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ロール判定ヘルパー (RLS / RPC から共通利用)
-- ---------------------------------------------------------------------------

-- tournament:operate_score  = OWNER / ADMIN / SCORE_OPERATOR
create function public.can_operate_score(p_tournament_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.has_tournament_role(
    p_tournament_id,
    array['OWNER', 'ADMIN', 'SCORE_OPERATOR']::public.tournament_member_role[]
  );
$$;

-- round_participants を書き込める(得点キャッシュ・組分け・参加者追加)ロール。
-- operate_score ∪ grade_paper_quiz ∪ manage_rounds
--   = OWNER / ADMIN / SCORE_OPERATOR / GRADER
create function public.can_write_round_participants(p_tournament_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.has_tournament_role(
    p_tournament_id,
    array['OWNER', 'ADMIN', 'SCORE_OPERATOR', 'GRADER']::public.tournament_member_role[]
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. round_score_state : 得点イベントの書き込みカウンタ
--    RLSを有効にしてポリシーを作らない = クライアントから直接は読み書き不可。
--    security definer の関数・トリガーだけが触る。
-- ---------------------------------------------------------------------------
create table public.round_score_state (
  round_id uuid primary key references public.rounds (id) on delete cascade,
  seq bigint not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.round_score_state is
  'ラウンドごとの score_events 書き込みカウンタ。再計算の楽観的排他(古い結果で上書きしない)に使う。';

alter table public.round_score_state enable row level security;
revoke all on public.round_score_state from anon, authenticated;

-- 行を(なければ作って)ロックし、現在の seq を返す。内部用。
create function public.lock_round_score_state(p_round_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
begin
  insert into public.round_score_state (round_id)
  values (p_round_id)
  on conflict (round_id) do nothing;

  select s.seq into v_seq
  from public.round_score_state s
  where s.round_id = p_round_id
  for update;

  return v_seq;
end;
$$;

revoke all on function public.lock_round_score_state(uuid) from public, anon, authenticated;

-- score_events に書き込みがあるたびに seq を進める。
-- RPC経由でも、(RLSを通った)直接INSERT/UPDATE経由でも必ず進む。
create function public.bump_round_score_seq()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.round_score_state (round_id, seq)
  values (new.round_id, 1)
  on conflict (round_id)
  do update set seq = public.round_score_state.seq + 1, updated_at = now();
  return null;
end;
$$;

create trigger score_events_bump_seq
  after insert or update on public.score_events
  for each row execute function public.bump_round_score_seq();

-- ---------------------------------------------------------------------------
-- 3. score_events の追記専用化
--    UPDATE で変更してよいのは voided_at / voided_by のセット(Undo)だけ。
--    FKの ON DELETE SET NULL (actor_id / voided_by が NULL になる更新)は許可する。
-- ---------------------------------------------------------------------------
create function public.guard_score_events_update()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.round_id is distinct from old.round_id
     or new.participant_id is distinct from old.participant_id
     or new.event_type is distinct from old.event_type
     or new.value is distinct from old.value
     or new.question_number is distinct from old.question_number
     or new.created_at is distinct from old.created_at
     or (new.actor_id is distinct from old.actor_id and new.actor_id is not null)
  then
    raise exception 'score_events is append-only: only voided_at / voided_by may be set'
      using errcode = '42501';
  end if;

  if old.voided_at is not null
     and (new.voided_at is distinct from old.voided_at
          or (new.voided_by is distinct from old.voided_by and new.voided_by is not null))
  then
    raise exception 'score event is already voided'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger score_events_guard_update
  before update on public.score_events
  for each row execute function public.guard_score_events_update();

-- ---------------------------------------------------------------------------
-- 4. RLS : round_participants / score_events をロール粒度にする (R-03)
-- ---------------------------------------------------------------------------
drop policy "round_participants_insert_staff" on public.round_participants;
drop policy "round_participants_update_staff" on public.round_participants;

create policy "round_participants_insert_scoring_roles"
  on public.round_participants for insert
  with check (
    exists (
      select 1
      from public.rounds r
      join public.participants p on p.tournament_id = r.tournament_id
      where r.id = round_id
        and p.id = participant_id
        and public.can_write_round_participants(r.tournament_id)
    )
  );

create policy "round_participants_update_scoring_roles"
  on public.round_participants for update
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and public.can_write_round_participants(r.tournament_id)
    )
  )
  with check (
    exists (
      select 1
      from public.rounds r
      join public.participants p on p.tournament_id = r.tournament_id
      where r.id = round_id
        and p.id = participant_id
        and public.can_write_round_participants(r.tournament_id)
    )
  );

drop policy "score_events_insert_staff" on public.score_events;
drop policy "score_events_update_staff" on public.score_events;

-- INSERT: operate_score ロールのみ。参加者はラウンドと同じ大会に属すること。
-- actor_id は自分自身(または未設定)のみ。他人名義の操作記録は作れない。
create policy "score_events_insert_operators"
  on public.score_events for insert
  with check (
    exists (
      select 1
      from public.rounds r
      join public.participants p on p.tournament_id = r.tournament_id
      where r.id = round_id
        and p.id = participant_id
        and public.can_operate_score(r.tournament_id)
    )
    and (actor_id is null or actor_id = auth.uid())
  );

-- UPDATE: Undo(voided_at のセット)用。列の制限は guard_score_events_update が行う。
create policy "score_events_update_operators"
  on public.score_events for update
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and public.can_operate_score(r.tournament_id)
    )
  )
  with check (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and public.can_operate_score(r.tournament_id)
    )
    and (voided_by is null or voided_by = auth.uid())
  );

-- DELETE のポリシーは作らない(= 誰も削除できない。追記専用)。

-- ---------------------------------------------------------------------------
-- 5. RPC (R-02 / R-04)
--    いずれも security definer + 関数内でロール検査。
--    anon には実行権限を与えない。
-- ---------------------------------------------------------------------------

-- 5.1 得点イベントの記録。
--     問題番号は INSERT と同じトランザクション内で読むため、
--     「問題送りの直後に前の問題番号で記録される」ずれが起きない。
create function public.record_score_event(
  p_tournament_id uuid,
  p_round_id uuid,
  p_participant_id uuid,
  p_event_type public.score_event_type,
  p_value numeric default null
)
returns public.score_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question integer;
  v_row public.score_events;
begin
  if auth.uid() is null or not public.can_operate_score(p_tournament_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select r.current_question_number into v_question
  from public.rounds r
  where r.id = p_round_id and r.tournament_id = p_tournament_id;
  if not found then
    raise exception 'round not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.participants p
    where p.id = p_participant_id and p.tournament_id = p_tournament_id
  ) then
    raise exception 'participant does not belong to this tournament' using errcode = '22023';
  end if;

  insert into public.score_events (round_id, participant_id, event_type, value, question_number, actor_id)
  values (p_round_id, p_participant_id, p_event_type, p_value, v_question, auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

-- 5.2 直前の(未取消の)イベントを取り消す。戻り値は取り消したイベントID(なければ null)。
--     round_score_state の行ロックで直列化するため、同時に2回Undoしても
--     同じイベントを二重に取り消さず、それぞれ別のイベントを取り消す。
create function public.undo_last_score_event(
  p_tournament_id uuid,
  p_round_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.can_operate_score(p_tournament_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.rounds r
    where r.id = p_round_id and r.tournament_id = p_tournament_id
  ) then
    raise exception 'round not found' using errcode = 'P0002';
  end if;

  perform public.lock_round_score_state(p_round_id);

  select e.id into v_id
  from public.score_events e
  where e.round_id = p_round_id and e.voided_at is null
  order by e.created_at desc, e.id desc
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.score_events
  set voided_at = now(), voided_by = auth.uid()
  where id = v_id;

  return v_id;
end;
$$;

-- 5.3 問題番号の前後移動。加算をDB側で原子的に行うため、
--     2人が同時に「次へ」を押しても片方が失われない(+2 になる)。
create function public.advance_round_question(
  p_tournament_id uuid,
  p_round_id uuid,
  p_direction text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  if auth.uid() is null or not public.can_operate_score(p_tournament_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_direction not in ('NEXT', 'PREV') then
    raise exception 'direction must be NEXT or PREV' using errcode = '22023';
  end if;

  update public.rounds r
  set current_question_number = greatest(
    1,
    r.current_question_number + case when p_direction = 'NEXT' then 1 else -1 end
  )
  where r.id = p_round_id and r.tournament_id = p_tournament_id
  returning r.current_question_number into v_next;

  if not found then
    raise exception 'round not found' using errcode = 'P0002';
  end if;

  return v_next;
end;
$$;

-- 5.4 再計算の読み取り側: 現在の seq。再計算は「seq → イベント」の順に読むこと
--     (順序が逆だと古い計算結果が通ってしまう)。
create function public.get_round_score_seq(p_round_id uuid)
returns bigint
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_tournament uuid;
  v_seq bigint;
begin
  select r.tournament_id into v_tournament from public.rounds r where r.id = p_round_id;
  if v_tournament is null then
    raise exception 'round not found' using errcode = 'P0002';
  end if;
  if not public.is_tournament_member(v_tournament) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select s.seq into v_seq from public.round_score_state s where s.round_id = p_round_id;
  return coalesce(v_seq, 0);
end;
$$;

-- 5.5 再計算結果の書き込み。
--     p_expected_seq が現在値と違えば何も書かず false を返す(呼び出し側は再計算をやり直す)。
--     p_rows の各要素: participant_id, score, rank, passed, correct_count,
--                      wrong_count, through_count, disqualified, won
create function public.apply_round_computation(
  p_round_id uuid,
  p_expected_seq bigint,
  p_rows jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament uuid;
  v_seq bigint;
begin
  select r.tournament_id into v_tournament from public.rounds r where r.id = p_round_id;
  if v_tournament is null then
    raise exception 'round not found' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not public.can_operate_score(v_tournament) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_seq := public.lock_round_score_state(p_round_id);
  if v_seq <> p_expected_seq then
    return false;
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows must be a json array' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as x(participant_id uuid)
    left join public.participants p
      on p.id = x.participant_id and p.tournament_id = v_tournament
    where p.id is null
  ) then
    raise exception 'participant does not belong to this tournament' using errcode = '22023';
  end if;

  insert into public.round_participants as rp (
    round_id, participant_id, score, rank, passed,
    correct_count, wrong_count, through_count, disqualified, won
  )
  select
    p_round_id, x.participant_id, x.score, x.rank, x.passed,
    coalesce(x.correct_count, 0), coalesce(x.wrong_count, 0), coalesce(x.through_count, 0),
    coalesce(x.disqualified, false), coalesce(x.won, false)
  from jsonb_to_recordset(p_rows) as x(
    participant_id uuid, score numeric, rank integer, passed boolean,
    correct_count integer, wrong_count integer, through_count integer,
    disqualified boolean, won boolean
  )
  on conflict (round_id, participant_id) do update set
    score = excluded.score,
    rank = excluded.rank,
    passed = excluded.passed,
    correct_count = excluded.correct_count,
    wrong_count = excluded.wrong_count,
    through_count = excluded.through_count,
    disqualified = excluded.disqualified,
    won = excluded.won;

  return true;
end;
$$;

-- 実行権限: ログイン済みユーザーのみ(関数内でさらにロールを検査する)。
revoke all on function public.record_score_event(uuid, uuid, uuid, public.score_event_type, numeric) from public, anon;
revoke all on function public.undo_last_score_event(uuid, uuid) from public, anon;
revoke all on function public.advance_round_question(uuid, uuid, text) from public, anon;
revoke all on function public.get_round_score_seq(uuid) from public, anon;
revoke all on function public.apply_round_computation(uuid, bigint, jsonb) from public, anon;

grant execute on function public.record_score_event(uuid, uuid, uuid, public.score_event_type, numeric) to authenticated;
grant execute on function public.undo_last_score_event(uuid, uuid) to authenticated;
grant execute on function public.advance_round_question(uuid, uuid, text) to authenticated;
grant execute on function public.get_round_score_seq(uuid) to authenticated;
grant execute on function public.apply_round_computation(uuid, bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. R-07 : entry_form_fields の公開SELECTから DRAFT 大会を除外する
--    (announcements / schedule_items と同じ可視性。スタッフは別ポリシーで常に閲覧可)
-- ---------------------------------------------------------------------------
drop policy "entry_form_fields_select_public" on public.entry_form_fields;

create policy "entry_form_fields_select_public"
  on public.entry_form_fields for select
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.status in ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'RUNNING', 'FINISHED', 'PUBLISHED')
    )
  );

create policy "entry_form_fields_select_staff"
  on public.entry_form_fields for select
  using (public.is_tournament_member(tournament_id));
QSCORE_EOF

echo "write: src/lib/csv.ts"
mkdir -p "$(dirname 'src/lib/csv.ts')"
cat > 'src/lib/csv.ts' <<'QSCORE_EOF'
/**
 * CSV 生成ユーティリティ。
 *
 * エントリー一覧のように「第三者が自由に入力できる値」を CSV に出力する場合、
 * 先頭が = + - @ タブ 改行 の文字列は Excel / Google Sheets に数式として評価される
 * (CSV/数式インジェクション, CWE-1236)。文字列セルの先頭に ' を付けて
 * 文字列として扱わせる(OWASP 推奨の対策)。
 *
 * 数値(number)はそのまま出力する(負の数を壊さないため)。数式として評価される
 * 危険があるのは「文字列」だけなので、無害化の対象は string のみ。
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r\n]/;
const NEEDS_QUOTING = /[",\r\n]/;

export function csvEscape(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);

  if (typeof value !== "number" && FORMULA_TRIGGER.test(s)) {
    s = `'${s}`;
  }

  if (NEEDS_QUOTING.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 行の配列を CSV 文字列にする。先頭に UTF-8 BOM を付け(日本語版 Excel で
 * 文字化けさせないため)、改行は CRLF。
 */
export function buildCsv(rows: unknown[][]): string {
  return "\uFEFF" + rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}
QSCORE_EOF

echo "write: src/lib/api/request.ts"
mkdir -p "$(dirname 'src/lib/api/request.ts')"
cat > 'src/lib/api/request.ts' <<'QSCORE_EOF'
/**
 * ブラウザから内部APIを呼ぶための薄いラッパー。
 *
 * 目的: 「fetch の応答を確認せず、失敗しても成功したふりをする」ことを防ぐ。
 * 得点操作画面のように無反応の失敗が致命的な画面では、必ず ok を確認して
 * 失敗理由を画面に出すこと。
 */
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; message: string };

function describe(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as { message?: unknown; error?: unknown };
    if (typeof b.message === "string" && b.message) return b.message;
    if (typeof b.error === "string" && b.error) return b.error;
  }
  if (status === 401 || status === 403) return "この操作を行う権限がありません";
  return `サーバーエラー (HTTP ${status})`;
}

export async function requestJson<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, message: "通信に失敗しました。ネットワークを確認してください" };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, status: response.status, message: describe(response.status, body) };
  }
  return { ok: true, status: response.status, data: body as T };
}
QSCORE_EOF

echo "write: src/lib/supabase/rpc-errors.ts"
mkdir -p "$(dirname 'src/lib/supabase/rpc-errors.ts')"
cat > 'src/lib/supabase/rpc-errors.ts' <<'QSCORE_EOF'
/**
 * Postgres 関数 (RPC) が返したエラーを HTTP ステータスに対応づける。
 *
 * supabase/migrations/0010_role_scoped_rls_and_score_rpc.sql の関数は
 * 次の SQLSTATE で失敗を表す:
 *   42501 : 権限なし (ロール不足 / 大会のスタッフではない)
 *   P0002 : 対象が存在しない (ラウンドが見つからない等)
 *   22023 : 引数が不正 (他大会の参加者 / 不正な direction 等)
 * それ以外は想定外のエラーとして 500 にする。
 */
export interface RpcErrorLike {
  message: string;
  code?: string | null;
}

export interface MappedRpcError {
  status: number;
  body: { error: string; message: string };
}

export function mapRpcError(error: RpcErrorLike): MappedRpcError {
  switch (error.code) {
    case "42501":
      return {
        status: 403,
        body: { error: "forbidden", message: "この操作を行う権限がありません" },
      };
    case "P0002":
      return {
        status: 404,
        body: { error: "not_found", message: "対象のラウンドまたは参加者が見つかりません" },
      };
    case "22023":
      return {
        status: 400,
        body: { error: "invalid_input", message: "指定が正しくありません(他の大会の参加者など)" },
      };
    default:
      return { status: 500, body: { error: "internal_error", message: error.message } };
  }
}
QSCORE_EOF

echo "write: src/lib/supabase/filters.ts"
mkdir -p "$(dirname 'src/lib/supabase/filters.ts')"
cat > 'src/lib/supabase/filters.ts' <<'QSCORE_EOF'
/**
 * PostgREST の .or() フィルタ文字列を安全に組み立てるためのヘルパー。
 *
 * 検索語をテンプレートリテラルで直接埋め込むと、カンマや括弧が
 * フィルタ構文の区切りとして解釈され、検索が壊れる(500になる)。
 * 対策は2段階:
 *   1. LIKE のワイルドカード (% _ ) とエスケープ文字 (\) をエスケープする
 *   2. 値全体をダブルクォートで囲み、中の " と \ をバックスラッシュでエスケープする
 *      (PostgREST の「予約文字を含む値は二重引用符で囲む」規則)
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

export function quotePostgrestValue(input: string): string {
  return `"${input.replace(/[\\"]/g, "\\$&")}"`;
}

const ENTRY_SEARCH_COLUMNS = ["display_name", "email", "affiliation"] as const;

/** エントリーの部分一致検索(表示名・メール・所属のいずれか)用の .or() 文字列。 */
export function buildEntrySearchFilter(term: string): string {
  const pattern = quotePostgrestValue(`%${escapeLikePattern(term)}%`);
  return ENTRY_SEARCH_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(",");
}
QSCORE_EOF

echo "write: src/lib/rules/apply-round-events.ts"
mkdir -p "$(dirname 'src/lib/rules/apply-round-events.ts')"
cat > 'src/lib/rules/apply-round-events.ts' <<'QSCORE_EOF'
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { evaluateRound, toScored } from "@/lib/rules/engine";
import type { AbstractScoreEvent, RuleConfig } from "@/lib/rules/types";
import { computeRanking, determineAdvancement } from "@/lib/scoring/ranking";

/** apply_round_computation (0010) に渡す1参加者ぶんの行。 */
export interface RoundParticipantRow {
  participant_id: string;
  score: number;
  rank: number | null;
  passed: boolean | null;
  correct_count: number;
  wrong_count: number;
  through_count: number;
  disqualified: boolean;
  won: boolean;
}

/**
 * 純粋関数: ルール設定・(取消されていない)イベント・ラウンドに所属する参加者から、
 * round_participants に書き込む行を導出する。DB には触らない。
 */
export function buildRoundParticipantRows(input: {
  ruleConfig: RuleConfig;
  advanceCount: number | null;
  events: AbstractScoreEvent[];
  attachedParticipantIds: string[];
}): RoundParticipantRow[] {
  const states = evaluateRound(input.ruleConfig, input.events);

  // イベントが1件もない参加者にも行(得点0・カウンタ0)が必要。
  // そうしないと、まだ何も答えていない人が順位表から消えてしまう。
  for (const participantId of input.attachedParticipantIds) {
    if (!states.has(participantId)) {
      states.set(participantId, {
        participantId,
        score: 0,
        correctCount: 0,
        wrongCount: 0,
        throughCount: 0,
        disqualified: false,
        won: false,
      });
    }
  }

  const ranked = computeRanking(toScored(states));
  const advancing = input.advanceCount
    ? determineAdvancement(ranked, input.advanceCount)
    : null;
  const rankById = new Map(ranked.map((r) => [r.id, r.rank]));

  return [...states.values()].map((s) => ({
    participant_id: s.participantId,
    score: s.score,
    rank: rankById.get(s.participantId) ?? null,
    passed: s.disqualified ? false : advancing ? advancing.has(s.participantId) : null,
    correct_count: s.correctCount,
    wrong_count: s.wrongCount,
    through_count: s.throughCount,
    disqualified: s.disqualified,
    won: s.won,
  }));
}

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_RETRY_DELAY_MS = 15;

export interface RecomputeOptions {
  /** 他の操作との競合で書き込みが拒否(stale)された場合の最大試行回数。 */
  maxAttempts?: number;
  /** 再試行までの待ち時間の基準(ms)。試行回数に比例し、ランダムなゆらぎを加える。 */
  retryDelayMs?: number;
}

/**
 * round_participants (score/rank/passed/correct_count/wrong_count/through_count/
 * disqualified/won) を、そのラウンドの「取消されていない score_events 全件」から
 * 再導出して書き込む。
 *
 * 「イベント記録」「Undo」の両APIルートが必ずここを通るため、2つの経路の
 * 計算ロジックがずれることはない(Undo は特別な処理ではなく、
 * 「1件が取消された状態での再計算」にすぎない。src/lib/rules/engine.ts 参照)。
 *
 * ## 同時操作での整合性 (R-04)
 * 以前は read → 計算 → 全件 upsert を排他なしで行っていたため、2人のオペレーターが
 * ほぼ同時に操作すると、古い計算結果が新しい結果を上書きしうる実装だった。現在は
 * 楽観的排他で解決している:
 *   1. get_round_score_seq で seq(score_events への書き込み回数)を「先に」読む
 *   2. イベント等を読んで計算する
 *   3. apply_round_computation(expected_seq = 1.で読んだ値) で書き込む
 *      → その間に別のイベントが書かれて seq が進んでいれば、DBは書き込みを拒否(false)する
 *   4. 拒否された場合は 1. からやり直す
 * 順序(seq を先に読む)が重要: 逆にすると、古いイベントに新しい seq が
 * 紐づいてしまい、古い計算結果が通ってしまう。
 *
 * 試行回数を使い切った場合は成功扱いで返す。seq が進み続けているということは
 * 他のリクエストがイベントを書き続けており、「最後にイベントを書いたリクエスト」の
 * 再計算は(その後に書き込みがないため)必ず成功し、最終的な状態を正しく反映するため。
 */
export async function recomputeRoundParticipants(
  supabase: SupabaseClient<Database>,
  roundId: string,
  options: RecomputeOptions = {}
): Promise<{ error: string } | { error: null }> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 1. seq を最初に読む(順序は必須。上のコメント参照)
    const { data: seq, error: seqError } = await supabase.rpc("get_round_score_seq", {
      p_round_id: roundId,
    });
    if (seqError) return { error: seqError.message };

    const { data: round, error: roundError } = await supabase
      .from("rounds")
      .select("rule_config, advance_count")
      .eq("id", roundId)
      .maybeSingle();
    if (roundError) return { error: roundError.message };
    if (!round) return { error: "round not found" };

    const { data: events, error: eventsError } = await supabase
      .from("score_events")
      .select("id, participant_id, event_type, value")
      .eq("round_id", roundId)
      .is("voided_at", null)
      .order("created_at", { ascending: true });
    if (eventsError) return { error: eventsError.message };

    const { data: attached, error: attachedError } = await supabase
      .from("round_participants")
      .select("participant_id")
      .eq("round_id", roundId);
    if (attachedError) return { error: attachedError.message };

    const rows = buildRoundParticipantRows({
      ruleConfig: round.rule_config,
      advanceCount: round.advance_count,
      events: (events ?? []).map((e) => ({
        id: e.id,
        participantId: e.participant_id,
        type: e.event_type,
        value: e.value ?? undefined,
      })),
      attachedParticipantIds: (attached ?? []).map((rp) => rp.participant_id),
    });

    if (rows.length === 0) return { error: null };

    // 3. 書き込み。seq が進んでいれば false が返る(何も書かれない)
    const { data: applied, error: applyError } = await supabase.rpc("apply_round_computation", {
      p_round_id: roundId,
      p_expected_seq: seq as number,
      p_rows: rows,
    });
    if (applyError) return { error: applyError.message };
    if (applied) return { error: null };

    // 4. stale: 少し待って最新の状態からやり直す
    if (attempt < maxAttempts && retryDelayMs > 0) {
      const wait = retryDelayMs * attempt * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  return { error: null };
}
QSCORE_EOF

echo "write: src/app/api/tournaments/[tournamentId]/rounds/[roundId]/events/route.ts"
mkdir -p "$(dirname 'src/app/api/tournaments/[tournamentId]/rounds/[roundId]/events/route.ts')"
cat > 'src/app/api/tournaments/[tournamentId]/rounds/[roundId]/events/route.ts' <<'QSCORE_EOF'
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { recomputeRoundParticipants } from "@/lib/rules/apply-round-events";
import { mapRpcError } from "@/lib/supabase/rpc-errors";

const createSchema = z.object({
  participantId: z.string().uuid(),
  type: z.enum(["CORRECT", "WRONG", "THROUGH", "MANUAL_ADJUST", "DISQUALIFY", "REINSTATE"]),
  value: z.number().optional(),
});

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("score_events")
    .select("*, participants ( id, display_name ), actor:actor_id ( display_name )")
    .eq("round_id", roundId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data });
}

// POST records one score event (master spec section 17: 正解/誤答/スルー/
// 加点/減点/失格 - each a one-touch action from the buzzer operator
// screen), then recomputes round_participants from the full event log.
//
// The insert goes through the record_score_event RPC (migration 0010): the
// database itself checks the caller's role (OWNER/ADMIN/SCORE_OPERATOR),
// that the participant belongs to this tournament, and stamps the current
// question number and actor in the same transaction. can() below is only
// there to return a clean 403 early - it is no longer the only gate.
export async function POST(request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:operate_score")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: event, error: recordError } = await supabase.rpc("record_score_event", {
    p_tournament_id: tournamentId,
    p_round_id: roundId,
    p_participant_id: parsed.data.participantId,
    p_event_type: parsed.data.type,
    p_value: parsed.data.value ?? null,
  });
  if (recordError) {
    const mapped = mapRpcError(recordError);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  const result = await recomputeRoundParticipants(supabase, roundId);
  if (result.error) {
    // The event itself IS recorded (append-only log); only the derived
    // scoreboard failed to refresh. Say so, so the operator doesn't re-enter it.
    return NextResponse.json(
      {
        error: "recompute_failed",
        message: `得点は記録されましたが、順位表の更新に失敗しました: ${result.error}`,
        event,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ event }, { status: 201 });
}
QSCORE_EOF

echo "write: src/app/api/tournaments/[tournamentId]/rounds/[roundId]/events/undo/route.ts"
mkdir -p "$(dirname 'src/app/api/tournaments/[tournamentId]/rounds/[roundId]/events/undo/route.ts')"
cat > 'src/app/api/tournaments/[tournamentId]/rounds/[roundId]/events/undo/route.ts' <<'QSCORE_EOF'
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { recomputeRoundParticipants } from "@/lib/rules/apply-round-events";
import { logAudit } from "@/lib/audit/log";
import { mapRpcError } from "@/lib/supabase/rpc-errors";

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

// POST /api/tournaments/[tournamentId]/rounds/[roundId]/events/undo
// Voids the most recent non-voided event for this round (any participant -
// "undo my last action" in a fast-paced buzzer round means the last thing
// that happened, not the last thing for one specific player) and
// recomputes. Voiding, not deleting, keeps the audit trail intact (master
// spec section 29/30).
//
// Picking and voiding the event happens inside the undo_last_score_event RPC
// under a per-round lock, so two simultaneous undos void two different
// events instead of voiding the same one twice.
export async function POST(_request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:operate_score")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const { data: voidedEventId, error: undoError } = await supabase.rpc("undo_last_score_event", {
    p_tournament_id: tournamentId,
    p_round_id: roundId,
  });
  if (undoError) {
    const mapped = mapRpcError(undoError);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
  if (!voidedEventId) {
    return NextResponse.json(
      { error: "no_events", message: "取り消せるイベントがありません" },
      { status: 409 }
    );
  }

  const result = await recomputeRoundParticipants(supabase, roundId);
  if (result.error) {
    return NextResponse.json(
      {
        error: "recompute_failed",
        message: `取り消しは記録されましたが、順位表の更新に失敗しました: ${result.error}`,
        voidedEventId,
      },
      { status: 500 }
    );
  }

  const user = await getCurrentUser();
  await logAudit(supabase, {
    tournamentId,
    actorId: user?.id ?? null,
    action: "score_event.undone",
    summary: "直前の得点イベントを取り消しました",
    roundId,
    metadata: { voidedEventId },
  });

  return NextResponse.json({ voidedEventId });
}
QSCORE_EOF

echo "write: src/app/api/tournaments/[tournamentId]/rounds/[roundId]/question/route.ts"
mkdir -p "$(dirname 'src/app/api/tournaments/[tournamentId]/rounds/[roundId]/question/route.ts')"
cat > 'src/app/api/tournaments/[tournamentId]/rounds/[roundId]/question/route.ts' <<'QSCORE_EOF'
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { mapRpcError } from "@/lib/supabase/rpc-errors";

const bodySchema = z.object({
  direction: z.enum(["NEXT", "PREV"]),
});

type RouteParams = { params: Promise<{ tournamentId: string; roundId: string }> };

// PATCH /api/tournaments/[tournamentId]/rounds/[roundId]/question
// Advances/retreats the round's current question number. This is plain
// round navigation state, not a score event - moving to the next question
// doesn't score anyone (see migration 0005 comment).
//
// Goes through the advance_round_question RPC (migration 0010) instead of
// updating `rounds` directly: the rounds UPDATE policy is admin-only, so a
// direct update silently failed for SCORE_OPERATOR (R-02). The RPC checks
// the operate_score roles itself and increments atomically, so two
// operators pressing "next" at the same moment advance by two, not one.
export async function PATCH(request: Request, { params }: RouteParams) {
  const { tournamentId, roundId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:operate_score")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: currentQuestionNumber, error } = await supabase.rpc("advance_round_question", {
    p_tournament_id: tournamentId,
    p_round_id: roundId,
    p_direction: parsed.data.direction,
  });
  if (error) {
    const mapped = mapRpcError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  return NextResponse.json({ currentQuestionNumber });
}
QSCORE_EOF

echo "write: src/app/api/tournaments/[tournamentId]/entries/export/route.ts"
mkdir -p "$(dirname 'src/app/api/tournaments/[tournamentId]/entries/export/route.ts')"
cat > 'src/app/api/tournaments/[tournamentId]/entries/export/route.ts' <<'QSCORE_EOF'
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTournamentRole } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { buildCsv } from "@/lib/csv";

type RouteParams = { params: Promise<{ tournamentId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { tournamentId } = await params;
  const role = await getTournamentRole(tournamentId);
  if (!can(role, "tournament:manage_entries")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const [{ data: fields, error: fieldsError }, { data: entries, error: entriesError }] =
    await Promise.all([
      supabase
        .from("entry_form_fields")
        .select("field_key, label")
        .eq("tournament_id", tournamentId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("entries")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("submitted_at", { ascending: true }),
    ]);

  if (fieldsError) return NextResponse.json({ error: fieldsError.message }, { status: 500 });
  if (entriesError) return NextResponse.json({ error: entriesError.message }, { status: 500 });

  const baseHeaders = ["表示名", "メールアドレス", "所属", "ステータス", "エントリー日時"];
  const customHeaders = (fields ?? []).map((f) => f.label);

  const rows = (entries ?? []).map((e) => {
    const base = [e.display_name, e.email, e.affiliation ?? "", e.status, e.submitted_at];
    const answers = e.answers as Record<string, unknown>;
    const custom = (fields ?? []).map((f) => answers?.[f.field_key] ?? "");
    return [...base, ...custom];
  });

  // buildCsv prepends a UTF-8 BOM (so Japanese Excel opens the file with the
  // right encoding) and neutralizes spreadsheet formula injection: entry
  // values come from an unauthenticated public form (R-01 / CWE-1236).
  const csv = buildCsv([[...baseHeaders, ...customHeaders], ...rows]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="entries-${tournamentId}.csv"`,
    },
  });
}
QSCORE_EOF

echo "patch: database.ts / README.md / package.json / entries/route.ts"
python3 - <<'QSCORE_PY'
import json, collections
def patch(path, old, new, count=1):
    s = open(path, encoding="utf-8").read()
    assert s.count(old) == count, f"{path}: 置換対象が見つかりません(想定外のファイル内容です)"
    open(path, "w", encoding="utf-8").write(s.replace(old, new))

# --- src/types/database.ts : Functions に新RPCを追加 ---
FN_BLOCK = '      // --- 0010_role_scoped_rls_and_score_rpc.sql ---\n      can_operate_score: {\n        Args: { p_tournament_id: string };\n        Returns: boolean;\n      };\n      can_write_round_participants: {\n        Args: { p_tournament_id: string };\n        Returns: boolean;\n      };\n      record_score_event: {\n        Args: {\n          p_tournament_id: string;\n          p_round_id: string;\n          p_participant_id: string;\n          p_event_type: ScoreEventType;\n          p_value?: number | null;\n        };\n        Returns: Database["public"]["Tables"]["score_events"]["Row"];\n      };\n      undo_last_score_event: {\n        Args: { p_tournament_id: string; p_round_id: string };\n        Returns: string | null;\n      };\n      advance_round_question: {\n        Args: { p_tournament_id: string; p_round_id: string; p_direction: "NEXT" | "PREV" };\n        Returns: number;\n      };\n      get_round_score_seq: {\n        Args: { p_round_id: string };\n        Returns: number;\n      };\n      apply_round_computation: {\n        Args: { p_round_id: string; p_expected_seq: number; p_rows: unknown };\n        Returns: boolean;\n      };\n'
patch("src/types/database.ts",
      "        Returns: boolean;\n      };\n    };\n  };\n}",
      "        Returns: boolean;\n      };\n" + FN_BLOCK + "    };\n  };\n}")

# --- package.json : simulate スクリプト(D-02) ---
d = json.load(open("package.json", encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
d["scripts"]["simulate"] = "tsx --env-file=.env.local scripts/simulate-tournament.ts"
open("package.json", "w", encoding="utf-8").write(json.dumps(d, indent=2, ensure_ascii=False) + "\n")

# --- entries/route.ts : 検索語の安全な組み立て(R-10) ---
E = "src/app/api/tournaments/[tournamentId]/entries/route.ts"
patch(E, 'import { can } from "@/lib/permissions";\n', 'import { can } from "@/lib/permissions";\nimport { buildEntrySearchFilter } from "@/lib/supabase/filters";\n')
patch(E, "    query = query.or(\n      `display_name.ilike.%${q}%,email.ilike.%${q}%,affiliation.ilike.%${q}%`\n    );\n",
         "    // 検索語はユーザー入力。カンマ・括弧・引用符がPostgRESTのフィルタ構文として解釈されないようにする(R-10)\n    query = query.or(buildEntrySearchFilter(q));\n")

# --- README.md : 開発フェーズ表記を実態に更新(D-01) ---
R_SECTION = '## 開発フェーズ\n\nマスタープロンプトの `# 53. 開発フェーズ` に基づく実装状況です。\n「コードが存在する」ことと「実機で検証済み」は別です。詳細な要件・残課題は\n[CONTRIBUTING.md](./CONTRIBUTING.md)(要件定義書)と [codereview.md](./codereview.md) を参照してください。\n\n- [x] **Phase 1**: プロジェクト基盤 / 認証 / ユーザー / 大会 / 権限(RLS・権限マトリクス)\n- [x] **Phase 2**: 大会CMS / 公開ページ / エントリー\n- [x] **Phase 3**: 参加者 / ペーパークイズ / 順位 / 自動組分け\n- [x] **Phase 4**: Stage / Round / ルールエンジン\n- [x] **Phase 5**: ScoreEvent / 早押し得点操作 / リアルタイム同期\n- [x] **Phase 6**: 監査ログ / Undo / エクスポート(表示レイアウトのバックアップ、全CSV対応は未了)\n- [~] **Phase 7**: カスタム表示エンジン(6種のブロック。JSON入出力・表示状態切替・追加ブロックは未実装)\n- [x] **Phase 8**: OBS Browser Source / 公開リアルタイム画面(スマホ向け順位表は未実装)\n- [ ] **Phase 9**: テスト強化 / 負荷検証 / セキュリティ / UX改善(進行中。下記)\n\n### 直近の変更 (マイグレーション 0010)\n\n- **ロール粒度のRLS**: `round_participants` / `score_events` の書き込みを、\n  `ROLE_ACTIONS` と対応するロールだけに限定(VIEWER 等はAPIを経由せず直接叩いても拒否)。\n  対応関係は `tests/unit/rls-permissions.test.ts` が検証します。\n- **得点操作のRPC化**: `record_score_event` / `undo_last_score_event` /\n  `advance_round_question`。SCORE_OPERATOR でも「次問題へ」が実行できます。\n- **再計算の排他制御**: `round_score_state.seq` による楽観的排他。複数オペレーターが\n  同時に操作しても、古い計算結果が新しい結果を上書きしません。\n- **score_events の追記専用化**: 変更できるのは Undo (`voided_at`) のみ。DELETE 不可。\n- CSV数式インジェクション対策、エントリー検索の特殊文字対応、セキュリティヘッダー追加。\n\n### 既知の制約\n\n- `round_participants` の得点キャッシュは、得点操作ロール(OWNER/ADMIN/SCORE_OPERATOR)が\n  RPC `apply_round_computation` で直接書けます(計算結果をクライアントが渡す設計のため)。\n  イベントログ(`score_events`)は追記専用で、次のイベント記録時にキャッシュは再計算されます。\n- 未実装の主な要件: スタッフの削除・ロール変更(R-06)、エントリーAPIのレート制限と重複防止(R-05)、\n  大会ステータスの訂正・中止(R-08)。\n\n### シミュレーション\n\n```bash\nnpm run simulate\n```\n\n`.env.local` の接続先に対して、50人 → 32人 → 4組 → 16人 → 8人 → 決勝 の大会を自動実行します\n(毎回、新しい大会とアカウントを作成します)。\n\n'
s = open("README.md", encoding="utf-8").read()
a = s.index("## 開発フェーズ"); b = s.index("### 技術選定に関する変更点")
s = s[:a] + R_SECTION + s[b:]
s = s.replace("現時点 (Phase 1) では、バックアップは Supabase 側の機能に依拠します。", "バックアップは Supabase 側の機能に依拠します。")
open("README.md", "w", encoding="utf-8").write(s)
QSCORE_PY

echo "Part 1 完了"
