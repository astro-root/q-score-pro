-- =============================================================================
-- Q-Score Pro : Phase 1 schema
-- Users / Tournaments / TournamentMembers / Permissions foundation
--
-- Design notes:
-- - `profiles` is intentionally separate from `auth.users`. Root's Laboratory
--   plans to share an account system across multiple services in the future,
--   so this table only stores what Q-Score Pro itself needs about a person.
-- - `tournament_members` is the staff role model (User acting on a Tournament).
--   It is NOT the same concept as `participants` (people competing in a
--   tournament), which is intentionally left for a later migration
--   (see section 5/11 of the master spec). Conflating the two would make the
--   future shared-auth integration much harder.
-- - Every tournament-scoped table carries `tournament_id` and is protected by
--   RLS so that staff of tournament A can never read/write tournament B data.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.tournament_status as enum (
  'DRAFT',
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'RUNNING',
  'FINISHED',
  'PUBLISHED'
);

create type public.tournament_member_role as enum (
  'OWNER',            -- 大会管理者 (full control, cannot be removed by non-owners)
  'ADMIN',            -- 大会管理者相当
  'QUESTION_MANAGER', -- 問題管理者
  'SCORE_OPERATOR',   -- 得点オペレーター
  'GRADER',           -- 採点担当
  'STREAM_OPERATOR',  -- 配信担当
  'VENUE_STAFF',      -- 会場スタッフ
  'VIEWER'            -- 閲覧専用
);

-- ---------------------------------------------------------------------------
-- profiles : one row per authenticated Root's Laboratory user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Root''s Laboratory 共通アカウントを見据えたユーザープロフィール。auth.users とは別概念。';

-- Auto-create a profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- tournaments : the central unit of the whole system
-- ---------------------------------------------------------------------------
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status public.tournament_status not null default 'DRAFT',
  owner_id uuid not null references public.profiles (id) on delete restrict,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])?$')
);

comment on table public.tournaments is '大会。システム全体の中心単位。全ての下位データはこれに紐づく。';

create index tournaments_owner_id_idx on public.tournaments (owner_id);
create index tournaments_status_idx on public.tournaments (status);

-- ---------------------------------------------------------------------------
-- tournament_members : staff roles, scoped per tournament
-- ---------------------------------------------------------------------------
create table public.tournament_members (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.tournament_member_role not null,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

comment on table public.tournament_members is
  '大会スタッフ。大会参加者(participants、将来のマイグレーションで追加)とは別概念。';

create index tournament_members_tournament_id_idx on public.tournament_members (tournament_id);
create index tournament_members_user_id_idx on public.tournament_members (user_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger set_tournaments_updated_at
  before update on public.tournaments
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper functions used by RLS policies
-- (kept in one place so policies stay declarative and testable)
-- ---------------------------------------------------------------------------

-- Is the current user any kind of staff member of the given tournament?
create function public.is_tournament_member(p_tournament_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_members tm
    where tm.tournament_id = p_tournament_id
      and tm.user_id = auth.uid()
  );
$$;

-- Does the current user hold one of the given roles on the tournament?
create function public.has_tournament_role(p_tournament_id uuid, p_roles public.tournament_member_role[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_members tm
    where tm.tournament_id = p_tournament_id
      and tm.user_id = auth.uid()
      and tm.role = any (p_roles)
  );
$$;

-- Convenience wrapper: OWNER or ADMIN ("大会管理者" level access)
create function public.is_tournament_admin(p_tournament_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.has_tournament_role(p_tournament_id, array['OWNER', 'ADMIN']::public.tournament_member_role[]);
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_members enable row level security;

-- profiles: a user can read/update only their own profile.
-- Other authenticated users may read a minimal set of profiles only via
-- server-side service-role calls (e.g. staff listing) - never directly.
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- tournaments:
-- - Public/anonymous users may only see PUBLISHED tournaments (public page).
-- - Any authenticated user may create a tournament (they become OWNER via
--   the API layer, in the same transaction as the member row).
-- - Only staff of that tournament may read non-published tournaments.
-- - Only OWNER/ADMIN may update or delete.
create policy "tournaments_select_published"
  on public.tournaments for select
  using (status = 'PUBLISHED');

create policy "tournaments_select_staff"
  on public.tournaments for select
  using (public.is_tournament_member(id));

create policy "tournaments_insert_authenticated"
  on public.tournaments for insert
  with check (owner_id = auth.uid());

create policy "tournaments_update_admin"
  on public.tournaments for update
  using (public.is_tournament_admin(id))
  with check (public.is_tournament_admin(id));

create policy "tournaments_delete_owner"
  on public.tournaments for delete
  using (owner_id = auth.uid());

-- tournament_members:
-- - Staff can see the member list of tournaments they belong to.
-- - Only OWNER/ADMIN can add/change/remove members.
-- - A member may always read their own membership row (needed to bootstrap
--   the UI right after being invited).
create policy "tournament_members_select_self"
  on public.tournament_members for select
  using (user_id = auth.uid());

create policy "tournament_members_select_staff"
  on public.tournament_members for select
  using (public.is_tournament_member(tournament_id));

create policy "tournament_members_insert_admin"
  on public.tournament_members for insert
  with check (public.is_tournament_admin(tournament_id));

-- Bootstrap policy: the very first member of a tournament (its OWNER) cannot
-- satisfy is_tournament_admin() yet because no member row exists at all.
-- Allow a user to insert themselves as OWNER only when they own the
-- tournament row itself, which is set inside the same server-side
-- transaction that creates the tournament.
create policy "tournament_members_insert_owner_bootstrap"
  on public.tournament_members for insert
  with check (
    role = 'OWNER'
    and user_id = auth.uid()
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.owner_id = auth.uid()
    )
  );

create policy "tournament_members_update_admin"
  on public.tournament_members for update
  using (public.is_tournament_admin(tournament_id))
  with check (public.is_tournament_admin(tournament_id));

create policy "tournament_members_delete_admin"
  on public.tournament_members for delete
  using (public.is_tournament_admin(tournament_id));
