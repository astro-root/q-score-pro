-- =============================================================================
-- Q-Score Pro : 0015
-- エントリー受付期間 / 応募時の参加者自動追加
--
-- - 受付期間(entry_opens_at / entry_closes_at)は null = 無制限。ステータスが
--   REGISTRATION_OPEN であることに加えて、期間内であることを RLS で強制する。
--   (アプリ層だけの制限は公開APIを直接叩けば回避できるため、DB側が本当の門。)
-- - entry_auto_register = true の大会では、応募(entries)が入った瞬間に参加者
--   (participants)を1件作る。entries と participants は別概念のまま
--   (participants.entry_id で出所を辿れるだけ)。既定は false =
--   従来どおり「主催者がスクリーニングしてから取り込む」運用。
-- - 既存データへの影響なし: 追加列は null / false が既定。既存の大会の挙動は変わらない。
-- =============================================================================

alter table public.tournaments
  add column entry_opens_at timestamptz,
  add column entry_closes_at timestamptz,
  add column entry_auto_register boolean not null default false;

alter table public.tournaments
  add constraint tournaments_entry_window_order
  check (entry_opens_at is null or entry_closes_at is null or entry_opens_at < entry_closes_at);

comment on column public.tournaments.entry_opens_at is 'エントリー受付開始(null=制限なし)。REGISTRATION_OPEN の間だけ意味を持つ。';
comment on column public.tournaments.entry_closes_at is 'エントリー受付締切(null=制限なし)。この時刻以降は受け付けない。';
comment on column public.tournaments.entry_auto_register is
  'true なら、応募を受け付けた時点で参加者を自動作成する(スクリーニングなしの大会向け)。';

-- 公開INSERTの条件に受付期間を加える。
drop policy "entries_insert_public_when_open" on public.entries;

create policy "entries_insert_public_when_open"
  on public.entries for insert
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.status = 'REGISTRATION_OPEN'
        and (t.entry_opens_at is null or t.entry_opens_at <= now())
        and (t.entry_closes_at is null or now() < t.entry_closes_at)
    )
  );

-- 応募 → 参加者の自動追加。
-- 応募者は未認証なので、参加者の INSERT は RLS を通らない。SECURITY DEFINER で、
-- 「設定が true の大会の、受理された応募」に限って、固定の列だけを写す。
create function public.entries_auto_register()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'SUBMITTED' and exists (
    select 1 from public.tournaments t
    where t.id = new.tournament_id and t.entry_auto_register
  ) then
    insert into public.participants (tournament_id, entry_id, display_name, affiliation)
    values (new.tournament_id, new.id, new.display_name, new.affiliation);
  end if;
  return new;
end;
$$;

revoke all on function public.entries_auto_register() from public, anon, authenticated;

create trigger entries_auto_register_after_insert
  after insert on public.entries
  for each row execute procedure public.entries_auto_register();
