-- =============================================================================
-- Q-Score Pro : 0014
-- ペーパークイズ: 問題単位の正誤 / 自動集計・順位 / プレート色
--
-- 設計方針:
-- - 既存の round_participants(score / rank / passed / correct_count / wrong_count)を
--   そのまま「現在値のキャッシュ」として使う。表示エンジン・OBS・既存画面は変更不要。
-- - 正誤(paper_answers)は事実の記録、score / rank / passed は再計算で得る派生値。
-- - 書き込みは SECURITY DEFINER の RPC だけ(paper_answers に書き込みポリシーを作らない)。
--   権限 / 大会またぎ / 問題とラウンドの整合 を RPC 内で検証し、採点から順位計算までを
--   1トランザクション + ラウンド単位のアドバイザリロックで直列化する。
--   同時に複数人が採点しても、最後に走った再計算が必ず全員分の最新値を読む。
-- - 既存データ保全: 回答が1件もない参加者の score は触らない
--   (これまでの「合計点の手入力」で入れた点数は、問題単位の採点を始めても消えない)。
-- - 順位は標準競争順位(1,2,2,4)。通過は「境界順位の同点者は全員通過」。
--   src/lib/scoring/ranking.ts と同じ規則(src/lib/paper/scoring.ts にもTS版がある)。
-- - 問題の書き込みは OWNER/ADMIN(manage_rounds 相当)、採点は can_write_round_participants
--   (OWNER/ADMIN/SCORE_OPERATOR/GRADER = grade_paper_quiz を含む)。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. テーブル
-- ---------------------------------------------------------------------------
create table public.paper_questions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  number integer not null check (number > 0),
  points numeric not null default 1 check (points >= 0),
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, number)
);

comment on table public.paper_questions is
  'ペーパークイズの設問(番号と配点)。問題文・解答は持たない(解答キーを公開側に出さないため)。label はジャンル等の補足。';

create trigger set_paper_questions_updated_at
  before update on public.paper_questions
  for each row execute procedure public.set_updated_at();

create table public.paper_answers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  question_id uuid not null references public.paper_questions (id) on delete cascade,
  is_correct boolean not null,
  graded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id, question_id)
);

comment on table public.paper_answers is
  '参加者×設問の正誤。未採点は行を持たない(is_correct が null の行は存在しない)。';

create index paper_answers_round_id_idx on public.paper_answers (round_id);
create index paper_answers_question_id_idx on public.paper_answers (question_id);

create trigger set_paper_answers_updated_at
  before update on public.paper_answers
  for each row execute procedure public.set_updated_at();

-- プレート色: ラウンドごとに参加者へ割り当てる(同じ人でもラウンドで色が変わりうる)。
alter table public.round_participants
  add column plate_color text
  check (plate_color is null or plate_color ~ '^#[0-9a-fA-F]{6}$');

comment on column public.round_participants.plate_color is
  'ペーパークイズのプレート(番号札)の色。#RRGGBB。未設定は null。';

-- ---------------------------------------------------------------------------
-- 2. RLS : 読み取りはスタッフ、書き込みは設問=管理者 / 回答=RPCのみ
-- ---------------------------------------------------------------------------
alter table public.paper_questions enable row level security;
alter table public.paper_answers enable row level security;

create policy "paper_questions_select_staff"
  on public.paper_questions for select
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_tournament_member(r.tournament_id)
    )
  );

create policy "paper_questions_insert_admin"
  on public.paper_questions for insert
  with check (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_tournament_admin(r.tournament_id)
    )
  );

create policy "paper_questions_update_admin"
  on public.paper_questions for update
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_tournament_admin(r.tournament_id)
    )
  )
  with check (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_tournament_admin(r.tournament_id)
    )
  );

create policy "paper_questions_delete_admin"
  on public.paper_questions for delete
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_tournament_admin(r.tournament_id)
    )
  );

create policy "paper_answers_select_staff"
  on public.paper_answers for select
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_tournament_member(r.tournament_id)
    )
  );
-- paper_answers に insert / update / delete ポリシーは作らない(RPC経由のみ)。

-- ---------------------------------------------------------------------------
-- 3. 再計算(内部用)。呼び出し側がロックと権限確認を済ませていること。
-- ---------------------------------------------------------------------------
create function public.paper_recompute_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adv integer;
  v_scored integer;
  v_boundary integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_round_id::text, 14));

  select r.advance_count into v_adv from public.rounds r where r.id = p_round_id;

  -- 回答が1件でもある参加者だけ、回答から得点を再計算する(手入力の点数は温存)。
  update public.round_participants rp
  set score = t.total,
      correct_count = t.correct,
      wrong_count = t.wrong
  from (
    select
      a.participant_id,
      coalesce(sum(q.points) filter (where a.is_correct), 0) as total,
      (count(*) filter (where a.is_correct))::integer as correct,
      (count(*) filter (where not a.is_correct))::integer as wrong
    from public.paper_answers a
    join public.paper_questions q on q.id = a.question_id
    where a.round_id = p_round_id
    group by a.participant_id
  ) t
  where rp.round_id = p_round_id
    and rp.participant_id = t.participant_id;

  -- 標準競争順位(同点は同順位、次は飛ぶ)。
  update public.round_participants rp
  set rank = r.rk
  from (
    select x.id, rank() over (order by x.score desc) as rk
    from public.round_participants x
    where x.round_id = p_round_id and x.score is not null
  ) r
  where rp.id = r.id;

  update public.round_participants
  set rank = null, passed = null
  where round_id = p_round_id and score is null;

  select count(*) into v_scored
  from public.round_participants
  where round_id = p_round_id and score is not null;

  if v_adv is null or v_scored = 0 then
    update public.round_participants set passed = null where round_id = p_round_id;
  else
    -- 通過人数の位置にいる人の順位 = 境界順位。同順位の人は全員通過。
    select s.rk into v_boundary
    from (
      select rank() over (order by x.score desc) as rk
      from public.round_participants x
      where x.round_id = p_round_id and x.score is not null
    ) s
    order by s.rk
    offset (least(v_adv, v_scored) - 1)
    limit 1;

    update public.round_participants
    set passed = (rank <= v_boundary)
    where round_id = p_round_id and score is not null;
  end if;
end;
$$;

revoke all on function public.paper_recompute_round(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. 公開RPC
-- ---------------------------------------------------------------------------

-- 設問の変更(配点・削除)後に呼ぶ。冪等。
create function public.recompute_paper_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament uuid;
begin
  select r.tournament_id into v_tournament from public.rounds r where r.id = p_round_id;
  if v_tournament is null then
    raise exception 'round not found' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not public.can_write_round_participants(v_tournament) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform public.paper_recompute_round(p_round_id);
end;
$$;

-- 正誤をまとめて保存して、そのまま得点・順位・通過を更新する。
-- p_answers: [{ "participant_id": uuid, "question_id": uuid, "is_correct": true|false|null }]
--   is_correct = null は「未採点に戻す」(行を削除)。キー自体は必須。
create function public.submit_paper_answers(p_round_id uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament uuid;
  v_type public.round_type;
begin
  select r.tournament_id, r.round_type into v_tournament, v_type
  from public.rounds r where r.id = p_round_id;
  if v_tournament is null then
    raise exception 'round not found' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not public.can_write_round_participants(v_tournament) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_type <> 'PAPER' then
    raise exception 'not a paper round' using errcode = '22023';
  end if;
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) > 20000 then
    raise exception 'p_answers must be a json array (max 20000)' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_round_id::text, 14));

  -- 設問はこのラウンドのもの、参加者はこのラウンドに参加している人だけ。
  if exists (
    select 1
    from jsonb_to_recordset(p_answers) as x(participant_id uuid, question_id uuid, is_correct boolean)
    left join public.paper_questions q on q.id = x.question_id and q.round_id = p_round_id
    left join public.round_participants rp
      on rp.participant_id = x.participant_id and rp.round_id = p_round_id
    where q.id is null or rp.id is null
  ) then
    raise exception 'question or participant does not belong to this round' using errcode = '22023';
  end if;

  delete from public.paper_answers a
  using jsonb_to_recordset(p_answers) as x(participant_id uuid, question_id uuid, is_correct boolean)
  where x.is_correct is null
    and a.round_id = p_round_id
    and a.participant_id = x.participant_id
    and a.question_id = x.question_id;

  insert into public.paper_answers (round_id, participant_id, question_id, is_correct, graded_by)
  select distinct on (x.participant_id, x.question_id)
    p_round_id, x.participant_id, x.question_id, x.is_correct, auth.uid()
  from jsonb_to_recordset(p_answers) as x(participant_id uuid, question_id uuid, is_correct boolean)
  where x.is_correct is not null
  order by x.participant_id, x.question_id
  on conflict (participant_id, question_id) do update
    set is_correct = excluded.is_correct,
        graded_by = excluded.graded_by;

  perform public.paper_recompute_round(p_round_id);
end;
$$;

revoke all on function public.recompute_paper_round(uuid) from public, anon;
revoke all on function public.submit_paper_answers(uuid, jsonb) from public, anon;
grant execute on function public.recompute_paper_round(uuid) to authenticated;
grant execute on function public.submit_paper_answers(uuid, jsonb) to authenticated;
