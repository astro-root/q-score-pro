-- =============================================================================
-- Q-Score Pro : 0016
-- 大会ホームページ: 受付期間の列の統合 / エントリー状況・大会結果の公開
--
-- 1. 0015 で作った entry_opens_at / entry_closes_at は、0002 から存在する
--    entry_starts_at / entry_ends_at と同じ概念だった(CMS画面と公開ページが既に使用)。
--    正を entry_starts_at / entry_ends_at に統一し、重複列を廃止する。
--    0015 の列に値があれば、それを引き継ぐ(0015 以降に実際に効いていた値のため)。
--    ※ これまで「表示だけ」だった受付期間が、RLS で強制されるようになる。
--      影響を受ける大会(受付中なのに期間外)は、下の NOTICE に大会名が出る。
-- 2. エントリー状況: tournaments.show_entry_count が true の大会だけ、件数を公開する。
-- 3. 大会結果: rounds.results_public が true のラウンドを、大会が PUBLISHED のときだけ公開する。
--    公開は SECURITY DEFINER 関数で、返す列を固定する(表示名・所属・順位・得点・通過のみ。
--    メールアドレス等は構造的に返せない)。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. 受付期間の列を統合
-- ---------------------------------------------------------------------------
update public.tournaments
set entry_starts_at = coalesce(entry_opens_at, entry_starts_at),
    entry_ends_at = coalesce(entry_closes_at, entry_ends_at)
where entry_opens_at is not null or entry_closes_at is not null;

drop policy "entries_insert_public_when_open" on public.entries;
alter table public.tournaments drop constraint tournaments_entry_window_order;
alter table public.tournaments
  drop column entry_opens_at,
  drop column entry_closes_at;

-- NOT VALID: 既存行は検査しない(従来は検証なしで保存できていたため)。以後の更新から強制。
alter table public.tournaments
  add constraint tournaments_entry_window_order
  check (entry_starts_at is null or entry_ends_at is null or entry_starts_at < entry_ends_at)
  not valid;

comment on column public.tournaments.entry_starts_at is
  'エントリー受付開始(null=制限なし)。REGISTRATION_OPEN の間、RLS(entries の INSERT)で強制される。';
comment on column public.tournaments.entry_ends_at is
  'エントリー受付締切(null=制限なし)。この時刻以降は受け付けない。';

create policy "entries_insert_public_when_open"
  on public.entries for insert
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.status = 'REGISTRATION_OPEN'
        and (t.entry_starts_at is null or t.entry_starts_at <= now())
        and (t.entry_ends_at is null or now() < t.entry_ends_at)
    )
  );

-- 期間が強制されるようになったことで、受付できなくなる大会を知らせる。
do $$
declare
  r record;
begin
  for r in
    select slug, entry_starts_at, entry_ends_at
    from public.tournaments
    where status = 'REGISTRATION_OPEN'
      and ((entry_starts_at is not null and entry_starts_at > now())
        or (entry_ends_at is not null and entry_ends_at <= now()))
  loop
    raise notice 'NOTE: tournament "%" is REGISTRATION_OPEN but outside its entry window (% - %); public entry is now refused until the window is changed.',
      r.slug, r.entry_starts_at, r.entry_ends_at;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. エントリー状況(件数のみ)
-- ---------------------------------------------------------------------------
alter table public.tournaments
  add column show_entry_count boolean not null default false;

comment on column public.tournaments.show_entry_count is
  'true なら、公開ページにエントリー件数を表示する。';

create function public.public_entry_count(p_slug text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when t.show_entry_count then
      (select count(*)::integer from public.entries e
       where e.tournament_id = t.id and e.status = 'SUBMITTED')
  end
  from public.tournaments t
  where t.slug = p_slug
    and t.status in ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'RUNNING', 'FINISHED', 'PUBLISHED');
$$;

-- ---------------------------------------------------------------------------
-- 3. 大会結果の公開
-- ---------------------------------------------------------------------------
alter table public.rounds
  add column results_public boolean not null default false;

comment on column public.rounds.results_public is
  'true のラウンドの順位表を、大会が PUBLISHED のときだけ公開ページに出す。';

create function public.public_tournament_results(p_slug text)
returns table (
  round_id uuid,
  round_name text,
  round_sort integer,
  rank integer,
  display_name text,
  affiliation text,
  score numeric,
  passed boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.name, r.sort_order, rp.rank, p.display_name, p.affiliation, rp.score, rp.passed
  from public.tournaments t
  join public.rounds r on r.tournament_id = t.id and r.results_public
  join public.round_participants rp on rp.round_id = r.id
  join public.participants p on p.id = rp.participant_id
  where t.slug = p_slug
    and t.status = 'PUBLISHED'
    and rp.rank is not null
    and p.status = 'ACTIVE'
  order by r.sort_order, rp.rank, p.display_name;
$$;

revoke all on function public.public_entry_count(text) from public;
revoke all on function public.public_tournament_results(text) from public;
grant execute on function public.public_entry_count(text) to anon, authenticated;
grant execute on function public.public_tournament_results(text) to anon, authenticated;
