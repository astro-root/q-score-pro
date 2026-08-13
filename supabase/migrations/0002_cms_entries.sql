-- =============================================================================
-- Q-Score Pro : Phase 2 schema
-- Tournament CMS / Public page / Entry system
--
-- Design notes:
-- - CMS content lives directly on `tournaments` (section 7 of the master
--   spec: it's still "the tournament", just more of it) except for the two
--   genuinely list-shaped concerns - announcements and schedule - which get
--   their own tables so staff can add/remove/reorder items independently.
-- - `entries` intentionally does NOT require an authenticated `profiles`
--   row. Public/anonymous entry submission is a hard requirement (anyone
--   should be able to enter a tournament without a Root's Laboratory
--   account). This is also why `entries` is not the same table as
--   `participants` (future migration): an entry is a raw registration
--   response, a participant is the accepted/managed competitor record that
--   Phase 3 will derive from entries after screening.
-- - Dynamic entry fields (organizer-defined questions, section 8) are
--   modeled as `entry_form_fields` (the schema) + a `answers jsonb` column
--   on `entries` (the data), rather than a full EAV table. This keeps
--   entries queryable as a simple table for the common case (list/search/
--   CSV export) while still allowing arbitrary per-tournament questions.
--   If per-answer relational querying becomes necessary later, `answers`
--   can be normalized into its own table without touching this migration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- tournaments : CMS fields
-- ---------------------------------------------------------------------------
alter table public.tournaments
  add column logo_url text,
  add column main_visual_url text,
  add column venue text,
  add column organizer_name text,
  add column contact_info text,
  add column rules_content text,
  add column notes text,
  add column event_starts_at timestamptz,
  add column event_ends_at timestamptz,
  add column entry_starts_at timestamptz,
  add column entry_ends_at timestamptz,
  add column capacity integer check (capacity is null or capacity > 0);

comment on column public.tournaments.rules_content is 'ルール(Markdown想定)';
comment on column public.tournaments.notes is '注意事項';

-- ---------------------------------------------------------------------------
-- announcements : お知らせ
-- ---------------------------------------------------------------------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  title text not null,
  body text not null,
  is_published boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index announcements_tournament_id_idx on public.announcements (tournament_id, created_at desc);

create trigger set_announcements_updated_at
  before update on public.announcements
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_items : スケジュール
-- ---------------------------------------------------------------------------
create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  label text not null,
  scheduled_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index schedule_items_tournament_id_idx on public.schedule_items (tournament_id, sort_order);

-- ---------------------------------------------------------------------------
-- entry_form_fields : 大会ごとのエントリー項目定義
-- ---------------------------------------------------------------------------
create type public.entry_field_type as enum ('TEXT', 'TEXTAREA', 'EMAIL', 'NUMBER', 'SELECT', 'CHECKBOX');

create table public.entry_form_fields (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type public.entry_field_type not null default 'TEXT',
  is_required boolean not null default false,
  options jsonb, -- for SELECT: string[]
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tournament_id, field_key)
);

create index entry_form_fields_tournament_id_idx on public.entry_form_fields (tournament_id, sort_order);

-- ---------------------------------------------------------------------------
-- entries : エントリー本体 (公開フォームからの応募。認証不要)
-- ---------------------------------------------------------------------------
create type public.entry_status as enum ('SUBMITTED', 'WITHDRAWN');

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  display_name text not null,
  email text not null,
  affiliation text,
  answers jsonb not null default '{}'::jsonb, -- { [field_key]: value }
  status public.entry_status not null default 'SUBMITTED',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.entries is
  '公開エントリーフォームからの応募。participants(将来のマイグレーション)とは別概念 - '
  'entriesは生の応募データ、participantsはスクリーニング後の管理対象データ。';

create index entries_tournament_id_idx on public.entries (tournament_id, submitted_at desc);
create index entries_tournament_email_idx on public.entries (tournament_id, email);

create trigger set_entries_updated_at
  before update on public.entries
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tournaments RLS follow-up: widen public visibility
--
-- The Phase 1 policy only exposed PUBLISHED tournaments publicly. Section 7
-- of the master spec expects a public tournament page to exist as soon as
-- entries open (name, logo, schedule, rules, entry info), not only after
-- results are published. DRAFT tournaments remain staff-only.
-- ---------------------------------------------------------------------------
drop policy "tournaments_select_published" on public.tournaments;

create policy "tournaments_select_public"
  on public.tournaments for select
  using (
    status in ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'RUNNING', 'FINISHED', 'PUBLISHED')
  );

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.announcements enable row level security;
alter table public.schedule_items enable row level security;
alter table public.entry_form_fields enable row level security;
alter table public.entries enable row level security;

-- announcements: public can read published announcements of published-or-open
-- tournaments; staff can read/write everything for their own tournament.
create policy "announcements_select_public"
  on public.announcements for select
  using (
    is_published = true
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.status in ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'RUNNING', 'FINISHED', 'PUBLISHED')
    )
  );

create policy "announcements_select_staff"
  on public.announcements for select
  using (public.is_tournament_member(tournament_id));

create policy "announcements_write_admin"
  on public.announcements for insert
  with check (public.is_tournament_admin(tournament_id));

create policy "announcements_update_admin"
  on public.announcements for update
  using (public.is_tournament_admin(tournament_id))
  with check (public.is_tournament_admin(tournament_id));

create policy "announcements_delete_admin"
  on public.announcements for delete
  using (public.is_tournament_admin(tournament_id));

-- schedule_items: same visibility shape as announcements, but there's no
-- "published" flag - a scheduled item is either visible (tournament is
-- publicly viewable) or staff-only (still DRAFT).
create policy "schedule_items_select_public"
  on public.schedule_items for select
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.status in ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'RUNNING', 'FINISHED', 'PUBLISHED')
    )
  );

create policy "schedule_items_select_staff"
  on public.schedule_items for select
  using (public.is_tournament_member(tournament_id));

create policy "schedule_items_write_admin"
  on public.schedule_items for insert
  with check (public.is_tournament_admin(tournament_id));

create policy "schedule_items_update_admin"
  on public.schedule_items for update
  using (public.is_tournament_admin(tournament_id))
  with check (public.is_tournament_admin(tournament_id));

create policy "schedule_items_delete_admin"
  on public.schedule_items for delete
  using (public.is_tournament_admin(tournament_id));

-- entry_form_fields: public needs to read the field definitions to render
-- the entry form; only staff (manage_entries-capable = OWNER/ADMIN) can
-- change them.
create policy "entry_form_fields_select_public"
  on public.entry_form_fields for select
  using (true);

create policy "entry_form_fields_write_admin"
  on public.entry_form_fields for insert
  with check (public.is_tournament_admin(tournament_id));

create policy "entry_form_fields_update_admin"
  on public.entry_form_fields for update
  using (public.is_tournament_admin(tournament_id))
  with check (public.is_tournament_admin(tournament_id));

create policy "entry_form_fields_delete_admin"
  on public.entry_form_fields for delete
  using (public.is_tournament_admin(tournament_id));

-- entries: anyone may INSERT while the tournament is accepting entries
-- (status = REGISTRATION_OPEN). Only staff may read the submitted entries -
-- there is deliberately no public "read my own entry back" policy yet,
-- since entries aren't tied to an authenticated user. Only OWNER/ADMIN can
-- modify/delete (screening, correcting a typo, withdrawing someone).
create policy "entries_insert_public_when_open"
  on public.entries for insert
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.status = 'REGISTRATION_OPEN'
    )
  );

create policy "entries_select_admin"
  on public.entries for select
  using (public.is_tournament_admin(tournament_id));

create policy "entries_update_admin"
  on public.entries for update
  using (public.is_tournament_admin(tournament_id))
  with check (public.is_tournament_admin(tournament_id));

create policy "entries_delete_admin"
  on public.entries for delete
  using (public.is_tournament_admin(tournament_id));
