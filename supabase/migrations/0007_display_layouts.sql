-- =============================================================================
-- Q-Score Pro : Phase 7 schema
-- Custom display engine: layouts
--
-- Design notes:
-- - A layout is stored as ONE jsonb document (`data`, shaped like
--   DisplayLayoutData in src/lib/display/types.ts: canvas + blocks[]),
--   rather than normalizing individual blocks into their own table. This
--   directly satisfies master spec section 50 (レイアウトのインポート/
--   エクスポート) for free - the export IS the column value - and matches
--   how the editor naturally works: the whole canvas is saved/loaded as one
--   unit, never partial blocks.
-- - Multiple layouts per tournament are just multiple rows (Main,
--   Scoreboard, Final, Result, OBS, Mobile, ... - section 24), with no
--   schema distinction between them beyond `name`.
-- - RLS is staff-only for now (read/write). Phase 8 (OBS Browser Source /
--   public display) will add a narrower public-read policy scoped to
--   layouts explicitly marked for public/OBS use - deferred so this
--   migration doesn't have to guess Phase 8's exact needs.
-- =============================================================================

create table public.display_layouts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text not null,
  data jsonb not null default '{"canvas":{"width":1920,"height":1080,"backgroundColor":"#0f172a","backgroundImageUrl":""},"blocks":[]}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.display_layouts is
  '得点表示画面のカスタムレイアウト。dataカラムがDisplayLayoutData(canvas+blocks)全体。';

create index display_layouts_tournament_id_idx on public.display_layouts (tournament_id, created_at);

create trigger set_display_layouts_updated_at
  before update on public.display_layouts
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.display_layouts enable row level security;

create policy "display_layouts_select_staff"
  on public.display_layouts for select
  using (public.is_tournament_member(tournament_id));

create policy "display_layouts_insert_admin"
  on public.display_layouts for insert
  with check (public.is_tournament_admin(tournament_id));

create policy "display_layouts_update_admin"
  on public.display_layouts for update
  using (public.is_tournament_admin(tournament_id))
  with check (public.is_tournament_admin(tournament_id));

create policy "display_layouts_delete_admin"
  on public.display_layouts for delete
  using (public.is_tournament_admin(tournament_id));
