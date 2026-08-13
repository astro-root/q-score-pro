-- =============================================================================
-- Q-Score Pro : Phase 6 schema
-- Audit log / backup foundation
--
-- Design notes:
-- - `score_events` (Phase 5) already provides a detailed, append-only trail
--   for scoring actions specifically. `audit_logs` is deliberately broader
--   and coarser: it covers the "who changed what, on what, when" story for
--   everything else that matters operationally - tournament settings,
--   staff membership, participant status, round status - so a single
--   screen can answer "what happened in this tournament today" without
--   scrolling through every individual buzzer press.
-- - Matches master spec section 30's required shape directly: 誰が(actor_id)
--   /いつ(created_at)/どの大会で(tournament_id)/どのラウンドで(round_id,
--   nullable - not every action is round-scoped)/どの参加者に
--   (participant_id, nullable)/何を・どのように(action, summary, metadata).
-- - Like score_events, rows are never updated or deleted by the
--   application - this table is the audit trail, mutating it would defeat
--   its purpose.
-- =============================================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null, -- e.g. 'tournament.status_changed', 'participant.status_changed'
  round_id uuid references public.rounds (id) on delete set null,
  participant_id uuid references public.participants (id) on delete set null,
  summary text not null, -- human-readable one-liner, already localized for direct display
  metadata jsonb not null default '{}'::jsonb, -- structured before/after detail
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is
  '大会運営全般の監査ログ(得点イベント固有の詳細はscore_eventsが担う)。追記専用。';

create index audit_logs_tournament_id_idx on public.audit_logs (tournament_id, created_at desc);
create index audit_logs_round_id_idx on public.audit_logs (round_id);
create index audit_logs_participant_id_idx on public.audit_logs (participant_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.audit_logs enable row level security;

-- Read: OWNER/ADMIN only - the audit log can reveal who is responsible for
-- mistakes, which is sensitive staff-management information, not something
-- every role (e.g. VENUE_STAFF) needs visibility into.
create policy "audit_logs_select_admin"
  on public.audit_logs for select
  using (public.is_tournament_admin(tournament_id));

-- Write: any tournament staff may insert a log entry describing their OWN
-- action (actor_id must be the caller). This lets narrower roles (e.g.
-- SCORE_OPERATOR changing a participant's round-level status) still get
-- logged without needing admin privileges just to write the log row.
create policy "audit_logs_insert_staff_self"
  on public.audit_logs for insert
  with check (
    public.is_tournament_member(tournament_id)
    and (actor_id is null or actor_id = auth.uid())
  );
