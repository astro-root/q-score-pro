-- =============================================================================
-- Q-Score Pro : Phase 3 schema
-- Participants / Rounds / Paper-quiz scoring / Ranking / Grouping
--
-- Design notes:
-- - `participants` is the accepted/managed competitor record. It is
--   deliberately separate from `entries` (raw registration response, Phase
--   2) - a staff member screens entries and creates participants from the
--   ones they accept. `entry_id` is a soft, nullable link back to the
--   originating entry for traceability; participants can also be created
--   manually (walk-in registration, seeded players, etc).
-- - `rounds` is intentionally minimal here (id, name, type, status, order,
--   advance_count). The full Stage/Round/Group *rule engine* described in
--   section 15/16 of the master spec (configurable scoring rules, ScoreEvent
--   stream) is Phase 4/5 territory. What Phase 3 needs is just enough round
--   structure to host a paper-quiz score + ranking + cutoff + grouping
--   workflow. Phase 4 will extend `rounds` rather than replace it.
-- - `round_participants` is the join between a round and the participants
--   competing in it, carrying the per-round paper score, computed rank,
--   pass/fail flag, and group assignment. Recomputing rank/pass from score
--   is done in the application layer (src/lib/scoring) so the logic is
--   independently unit-testable, matching section 40 of the master spec.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.participant_status as enum ('ACTIVE', 'DISQUALIFIED', 'ABSENT', 'WITHDRAWN');
create type public.round_type as enum ('PAPER', 'BUZZER');
create type public.round_status as enum ('NOT_STARTED', 'RUNNING', 'PAUSED', 'FINISHED');

-- ---------------------------------------------------------------------------
-- participants
-- ---------------------------------------------------------------------------
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  entry_id uuid references public.entries (id) on delete set null,
  display_name text not null,
  affiliation text,
  status public.participant_status not null default 'ACTIVE',
  seed integer, -- optional pre-tournament seeding, used by grouping (シード考慮)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.participants is
  '大会参加者(スクリーニング後の管理対象)。entries(生の応募データ)とは別概念。';

create index participants_tournament_id_idx on public.participants (tournament_id);

create trigger set_participants_updated_at
  before update on public.participants
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- rounds
-- ---------------------------------------------------------------------------
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text not null,
  round_type public.round_type not null default 'PAPER',
  status public.round_status not null default 'NOT_STARTED',
  sort_order integer not null default 0,
  advance_count integer check (advance_count is null or advance_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.rounds.advance_count is
  '通過人数のカットライン。同着(タイ)の場合は境界順位の参加者を全員通過扱いとする(公平性優先)。';

create index rounds_tournament_id_idx on public.rounds (tournament_id, sort_order);

create trigger set_rounds_updated_at
  before update on public.rounds
  for each row execute procedure public.set_updated_at();

-- Enforce a valid, minimal state machine at the DB level as a last resort
-- (the application layer in src/lib/tournament/round-status.ts is the
-- primary, testable gate - see Phase 1 precedent with tournament status).
create function public.check_round_status_transition()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' and old.status <> new.status then
    if not (
      (old.status = 'NOT_STARTED' and new.status = 'RUNNING') or
      (old.status = 'RUNNING' and new.status in ('PAUSED', 'FINISHED')) or
      (old.status = 'PAUSED' and new.status = 'RUNNING')
    ) then
      raise exception 'invalid round status transition: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_round_status_transition
  before update on public.rounds
  for each row execute procedure public.check_round_status_transition();

-- ---------------------------------------------------------------------------
-- round_participants
-- ---------------------------------------------------------------------------
create table public.round_participants (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  group_label text,
  score numeric,
  rank integer,
  passed boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, participant_id)
);

create index round_participants_round_id_idx on public.round_participants (round_id);
create index round_participants_participant_id_idx on public.round_participants (participant_id);

create trigger set_round_participants_updated_at
  before update on public.round_participants
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.participants enable row level security;
alter table public.rounds enable row level security;
alter table public.round_participants enable row level security;

-- participants: staff-only (view for everyone with tournament:view-level
-- access i.e. any tournament_member; write restricted to manage_participants
-- capable roles, enforced at the application layer via can() - RLS here
-- only distinguishes "any staff" from "no staff", matching how
-- tournament_members itself is scoped).
create policy "participants_select_staff"
  on public.participants for select
  using (public.is_tournament_member(tournament_id));

create policy "participants_write_admin"
  on public.participants for insert
  with check (public.is_tournament_admin(tournament_id));

create policy "participants_update_admin"
  on public.participants for update
  using (public.is_tournament_admin(tournament_id))
  with check (public.is_tournament_admin(tournament_id));

create policy "participants_delete_admin"
  on public.participants for delete
  using (public.is_tournament_admin(tournament_id));

-- rounds: readable by any staff member (needed for dashboards / OBS-adjacent
-- roles later); write restricted to admins for now. Score entry roles
-- (GRADER, SCORE_OPERATOR) get their own, narrower policies below on
-- round_participants rather than on rounds itself.
create policy "rounds_select_staff"
  on public.rounds for select
  using (public.is_tournament_member(tournament_id));

create policy "rounds_write_admin"
  on public.rounds for insert
  with check (public.is_tournament_admin(tournament_id));

create policy "rounds_update_admin"
  on public.rounds for update
  using (public.is_tournament_admin(tournament_id))
  with check (public.is_tournament_admin(tournament_id));

create policy "rounds_delete_admin"
  on public.rounds for delete
  using (public.is_tournament_admin(tournament_id));

-- round_participants: any staff can read (score displays, dashboards).
-- Write access is broader than "admin only" on purpose - GRADER needs to
-- enter paper-quiz scores day-of without being promoted to ADMIN. We check
-- tournament membership here at the RLS layer and defer the finer-grained
-- "is this specific role allowed to grade" decision to the API route's
-- can() check, exactly as documented in src/lib/permissions/index.ts.
create policy "round_participants_select_staff"
  on public.round_participants for select
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and public.is_tournament_member(r.tournament_id)
    )
  );

create policy "round_participants_insert_staff"
  on public.round_participants for insert
  with check (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and public.is_tournament_member(r.tournament_id)
    )
  );

create policy "round_participants_update_staff"
  on public.round_participants for update
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and public.is_tournament_member(r.tournament_id)
    )
  )
  with check (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and public.is_tournament_member(r.tournament_id)
    )
  );

create policy "round_participants_delete_admin"
  on public.round_participants for delete
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and public.is_tournament_admin(r.tournament_id)
    )
  );
