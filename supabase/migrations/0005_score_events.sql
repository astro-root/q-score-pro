-- =============================================================================
-- Q-Score Pro : Phase 5 schema
-- ScoreEvent persistence / buzzer operation / realtime sync
--
-- Design notes:
-- - `score_events` is an append-only log, matching master spec section 16
--   exactly: 得点は単なる数値として扱わず、イベントとして記録する。Rows are
--   never deleted or mutated except for the `voided_at` flag, which is how
--   Undo works here - voiding is itself an explicit, auditable action
--   (who voided what, when), not silent deletion. The full audit log UI is
--   Phase 6, but the underlying data model that makes it possible is laid
--   down here.
-- - `round_participants` gains the aggregate columns the rule engine
--   produces (correct_count, wrong_count, through_count, disqualified,
--   won) so the operator screen can render them directly without
--   recomputing client-side. These columns are always DERIVED by folding
--   score_events through the rule engine (src/lib/rules/engine.ts) - they
--   are a cache of that computation, never edited directly except via the
--   recompute path, exactly like `score`/`rank`/`passed` already were in
--   Phase 3.
-- - `rounds.current_question_number` is round-level navigation state (次問
--   題/前問題), deliberately NOT modeled as a score_event: moving to the
--   next question doesn't score anyone, so folding it through the rule
--   engine would be meaningless. It is plain round state, updated directly.
-- - Round-level disqualification (round_participants.disqualified) is
--   intentionally separate from `participants.status = 'DISQUALIFIED'`
--   (Phase 3, tournament-wide). A participant can be disqualified from one
--   round (e.g. false-start rule) while remaining eligible for others.
-- =============================================================================

create type public.score_event_type as enum (
  'CORRECT',
  'WRONG',
  'THROUGH',
  'MANUAL_ADJUST',
  'DISQUALIFY',
  'REINSTATE'
);

create table public.score_events (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  event_type public.score_event_type not null,
  value numeric, -- used by MANUAL_ADJUST only
  question_number integer,
  actor_id uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.score_events is
  '得点イベントの追記専用ログ。Undoは行の削除ではなくvoided_atのセットで表現し、'
  '監査証跡を保つ。現在の得点・順位はこのログからの再計算値。';

create index score_events_round_id_idx on public.score_events (round_id, created_at);
create index score_events_participant_id_idx on public.score_events (participant_id);

alter table public.round_participants
  add column correct_count integer not null default 0,
  add column wrong_count integer not null default 0,
  add column through_count integer not null default 0,
  add column disqualified boolean not null default false,
  add column won boolean not null default false;

alter table public.rounds
  add column current_question_number integer not null default 1;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.score_events enable row level security;

-- Read: any tournament staff (needed for the live operator screen, audit
-- trail display, and realtime subscriptions across multiple simultaneous
-- operators - section 10 of the master spec).
create policy "score_events_select_staff"
  on public.score_events for select
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and public.is_tournament_member(r.tournament_id)
    )
  );

-- Write: any tournament staff may insert events. The finer-grained "is this
-- role actually allowed to operate the buzzer screen" check
-- (tournament:operate_score) happens in the API route via can(), same
-- pattern already used for round_participants in Phase 3 - RLS enforces
-- "staff of THIS tournament only", the app layer enforces "which role".
create policy "score_events_insert_staff"
  on public.score_events for insert
  with check (
    exists (
      select 1 from public.rounds r
      where r.id = round_id
        and public.is_tournament_member(r.tournament_id)
    )
  );

-- Voiding (Undo) is done via UPDATE of voided_at/voided_by only - staff-wide
-- at the RLS layer, narrowed to tournament:operate_score in the API route.
create policy "score_events_update_staff"
  on public.score_events for update
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

-- ---------------------------------------------------------------------------
-- Realtime: the buzzer operator screen subscribes directly to these tables
-- (see src/app/(dashboard)/tournaments/[tournamentId]/rounds/[roundId]/
-- operate/operator-screen.tsx) so multiple simultaneous operators
-- (master spec section 10) see each other's actions live. RLS still
-- applies to realtime postgres_changes payloads, so this does not weaken
-- the tournament data isolation guarantees.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.round_participants;
alter publication supabase_realtime add table public.rounds;
