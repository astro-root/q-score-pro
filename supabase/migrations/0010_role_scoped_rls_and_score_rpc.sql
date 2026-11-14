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
